"""Skill API tests."""

import asyncio

from skill.router import (
    GetDocumentRequest,
    GetNodeInfoRequest,
    ListDocumentsRequest,
    RagSearchRequest,
    get_skill,
    list_skills,
    run_get_document,
    run_get_node_info,
    run_list_documents,
    run_rag_search,
)
from skill.service import SKILL_ID


def test_list_skills() -> None:
    payload = asyncio.run(list_skills())
    assert payload.success is True
    assert payload.data[0].id == SKILL_ID


def test_get_skill_detail() -> None:
    payload = asyncio.run(get_skill(SKILL_ID))
    assert payload.data.id == SKILL_ID
    assert "get_node_info" in [tool.name for tool in payload.data.tools]
    assert "知识库查询 Skill" in payload.data.documentation_markdown


def test_list_documents_tool() -> None:
    payload = asyncio.run(run_list_documents(SKILL_ID, ListDocumentsRequest(keywords=[])))
    assert payload["success"] is True
    assert payload["data"]["tool"] == "list_documents"
    assert payload["data"]["result"]["total"] > 0


def test_get_node_info_tool() -> None:
    payload = asyncio.run(run_get_node_info(SKILL_ID, GetNodeInfoRequest(names=["碰撞触发器"])))
    assert payload["success"] is True
    assert payload["data"]["tool"] == "get_node_info"
    assert payload["data"]["result"][0]["query"] == "碰撞触发器"


def test_get_document_tool() -> None:
    payload = asyncio.run(run_get_document(SKILL_ID, GetDocumentRequest(titles=["事件节点"])))
    assert payload["success"] is True
    assert payload["data"]["tool"] == "get_document"
    assert payload["data"]["result"][0]["query"] == "事件节点"


def test_rag_search_tool_signature() -> None:
    request = RagSearchRequest(queries=["碰撞事件怎么触发"], top_k=3)
    assert request.queries == ["碰撞事件怎么触发"]
    assert request.top_k == 3