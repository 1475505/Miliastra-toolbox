"""Allow running as: python3 -m mcp"""
from mcp_server import mcp, _parse_transport

mcp.run(transport=_parse_transport())
