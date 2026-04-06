"""Skill discovery and HTTP execution API."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from skill.service import (
    SKILL_ID,
    SKILL_VERSION,
    get_document_data,
    get_node_info_data,
    list_documents_data,
    rag_search_data,
    read_skill_markdown,
)

router = APIRouter()


class SkillParameter(BaseModel):
    name: str
    type: str
    required: bool
    description: str
    default_value: str | int | None = None


class SkillToolDefinition(BaseModel):
    name: str
    description: str
    http_path: str
    parameters: list[SkillParameter]


class SkillSummary(BaseModel):
    id: str
    version: str
    title: str
    description: str
    transports: list[str]
    tools: list[SkillToolDefinition]


class SkillDetail(SkillSummary):
    documentation_markdown: str


class SkillListResponse(BaseModel):
    success: bool
    data: list[SkillSummary]
    error: None = None


class SkillDetailResponse(BaseModel):
    success: bool
    data: SkillDetail
    error: None = None


class GetNodeInfoRequest(BaseModel):
    names: list[str] = Field(..., min_length=1, description="节点名称列表，支持模糊匹配")


class ListDocumentsRequest(BaseModel):
    keywords: list[str] = Field(default_factory=list, description="可选文档关键词列表")


class GetDocumentRequest(BaseModel):
    titles: list[str] = Field(..., min_length=1, description="文档标题或文件名关键词列表")


class RagSearchRequest(BaseModel):
    queries: list[str] = Field(..., min_length=1, description="自然语言查询列表")
    top_k: int = Field(default=5, ge=1, le=20)


def _build_tools() -> list[SkillToolDefinition]:
    base_path = f"/api/v1/skills/{SKILL_ID}/tools"
    return [
        SkillToolDefinition(
            name="get_node_info",
            description="根据节点名称查询节点说明、参数表、所属文档。",
            http_path=f"{base_path}/get_node_info",
            parameters=[
                SkillParameter(name="names", type="string[]", required=True, description="节点名称列表")
            ],
        ),
        SkillToolDefinition(
            name="list_documents",
            description="列出知识库文档标题和路径，可按关键词过滤。",
            http_path=f"{base_path}/list_documents",
            parameters=[
                SkillParameter(name="keywords", type="string[]", required=False, description="关键词列表")
            ],
        ),
        SkillToolDefinition(
            name="get_document",
            description="根据文档标题获取完整文档内容。",
            http_path=f"{base_path}/get_document",
            parameters=[
                SkillParameter(name="titles", type="string[]", required=True, description="文档标题列表")
            ],
        ),
        SkillToolDefinition(
            name="rag_search",
            description="使用向量检索在知识库中搜索相关内容。",
            http_path=f"{base_path}/rag_search",
            parameters=[
                SkillParameter(name="queries", type="string[]", required=True, description="自然语言查询列表"),
                SkillParameter(name="top_k", type="integer", required=False, description="每个查询返回的结果数", default_value=5),
            ],
        ),
    ]


def _build_skill_summary() -> SkillSummary:
    return SkillSummary(
        id=SKILL_ID,
        version=SKILL_VERSION,
        title="Miliastra Knowledge",
        description="以 skill + HTTP API 形式暴露千星沙箱知识库查询能力。",
        transports=["mcp", "http"],
        tools=_build_tools(),
    )


def _build_skill_detail() -> SkillDetail:
    summary = _build_skill_summary()
    return SkillDetail(**summary.model_dump(), documentation_markdown=read_skill_markdown())


def _assert_skill(skill_id: str) -> None:
    if skill_id != SKILL_ID:
        raise HTTPException(status_code=404, detail=f"未知 skill: {skill_id}")


@router.get("/skills", response_model=SkillListResponse)
async def list_skills() -> SkillListResponse:
    return SkillListResponse(success=True, data=[_build_skill_summary()])


@router.get("/skills/{skill_id}", response_model=SkillDetailResponse)
async def get_skill(skill_id: str) -> SkillDetailResponse:
    _assert_skill(skill_id)
    return SkillDetailResponse(success=True, data=_build_skill_detail())


@router.post("/skills/{skill_id}/tools/get_node_info")
async def run_get_node_info(skill_id: str, request: GetNodeInfoRequest):
    _assert_skill(skill_id)
    return {"success": True, "data": {"skill": skill_id, "tool": "get_node_info", "result": get_node_info_data(request.names)}, "error": None}


@router.post("/skills/{skill_id}/tools/list_documents")
async def run_list_documents(skill_id: str, request: ListDocumentsRequest):
    _assert_skill(skill_id)
    return {"success": True, "data": {"skill": skill_id, "tool": "list_documents", "result": list_documents_data(request.keywords)}, "error": None}


@router.post("/skills/{skill_id}/tools/get_document")
async def run_get_document(skill_id: str, request: GetDocumentRequest):
    _assert_skill(skill_id)
    return {"success": True, "data": {"skill": skill_id, "tool": "get_document", "result": get_document_data(request.titles)}, "error": None}


@router.post("/skills/{skill_id}/tools/rag_search")
async def run_rag_search(skill_id: str, request: RagSearchRequest):
    _assert_skill(skill_id)
    return {"success": True, "data": {"skill": skill_id, "tool": "rag_search", "result": rag_search_data(request.queries, top_k=request.top_k)}, "error": None}
