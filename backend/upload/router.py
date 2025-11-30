from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
import os
import time
import shutil
from qcloud_cos import CosConfig, CosS3Client
import sys
import logging

# 配置日志
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

router = APIRouter(tags=["upload"])

# COS 配置
SECRET_ID = os.environ.get("COS_SECRET_ID")
SECRET_KEY = os.environ.get("COS_SECRET_KEY")
REGION = os.environ.get("COS_REGION")
BUCKET = os.environ.get("COS_BUCKET")

class UploadResponse(BaseModel):
    url: str
    markdown: str

@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    if not all([SECRET_ID, SECRET_KEY, REGION, BUCKET]):
        raise HTTPException(status_code=500, detail="COS configuration missing on server")

    # 检查文件大小 (10MB = 10 * 1024 * 1024 bytes)
    MAX_SIZE = 10 * 1024 * 1024
    
    # 读取文件内容以检查大小，注意这会消耗内存，对于大文件最好分块读取或使用spooled temp file
    # FastAPI UploadFile 使用 SpooledTemporaryFile，超过一定大小会存磁盘
    # 这里我们先读取 content-length header 如果有，或者 seek end
    
    # 简单检查 content-length header
    # if file.size > MAX_SIZE: ... (UploadFile doesn't have size attribute directly available reliably across versions without reading)
    
    # 让我们先保存到临时文件，然后检查大小
    temp_filename = f"temp_{int(time.time())}_{file.filename}"
    temp_path = os.path.join("/tmp", temp_filename)
    
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        file_size = os.path.getsize(temp_path)
        if file_size > MAX_SIZE:
            os.remove(temp_path)
            raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")
            
        # 初始化 COS 客户端
        config = CosConfig(Region=REGION, SecretId=SECRET_ID, SecretKey=SECRET_KEY)
        client = CosS3Client(config)
        
        # 生成上传 Key (文件名)
        # 自动重命名策略：检查是否存在，存在则追加时间戳
        # 但为了简单和性能，且符合"如果冲突自带重命名"的要求，我们可以直接追加时间戳或者UUID
        # 或者先 head_object 检查
        
        key = file.filename
        # 移除开头的 /
        if key.startswith("/"):
            key = key[1:]
            
        # 检查是否存在
        try:
            client.head_object(Bucket=BUCKET, Key=key)
            # 如果没有抛出异常，说明文件存在，需要重命名
            name, ext = os.path.splitext(key)
            key = f"{name}_{int(time.time())}{ext}"
        except Exception:
            # 文件不存在 (或其它错误)，直接使用原名
            pass
            
        # 上传文件
        client.put_object_from_local_file(
            Bucket=BUCKET,
            LocalFilePath=temp_path,
            Key=key
        )
        
        # 生成 URL
        url = f"https://{BUCKET}.cos.{REGION}.myqcloud.com/{key}"
        # URL 编码处理? 通常 COS URL 不需要对整个 path 编码，但如果文件名包含特殊字符需要
        # 简单起见，假设文件名相对规范。如果需要编码，可以使用 urllib.parse.quote
        
        return UploadResponse(
            url=url,
            markdown=f"![{file.filename}]({url})"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
    finally:
        # 清理临时文件
        if os.path.exists(temp_path):
            os.remove(temp_path)
