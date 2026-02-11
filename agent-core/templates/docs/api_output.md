<!--
  TEMPLATE: API Documentation
  DOC_TYPE: api

  AGENT-FILLED VARIABLES:
  - {{api_title}}: API name/title
  - {{author}}: Git user or agent name
  - {{date}}: ISO date (YYYY-MM-DD)
  - {{base_url}}: Base URL for the API
  - {{workspace_name}}: Project name
-->
# API Reference – {{api_title}}

| Field | Value |
|-------|-------|
| Author | `{{author}}` |
| Date | `{{date}}` |
| Base URL | `{{base_url}}` |
| Workspace | `{{workspace_name}}` |

---

## Authentication

| Method | Header | Description |
|--------|--------|-------------|
| | `Authorization: Bearer <token>` | |

---

## Endpoints

### `METHOD /path`

**Description**: [What this endpoint does]

**Parameters:**

| Name | Type | In | Required | Description |
|------|------|----|----------|-------------|
| | | query/path/body | Yes/No | |

**Request Body:**
```json
{}
```

**Response:**
```json
{}
```

**Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request |
| 401 | Unauthorized |
| 404 | Not Found |

---

## Error Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

---

## Rate Limits

| Tier | Requests/min | Notes |
|------|-------------|-------|
| | | |

---

> Keep this document under 500 lines. Add new endpoints by copying the endpoint block above.
