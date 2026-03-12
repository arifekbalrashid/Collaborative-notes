# Real-Time Collaborative Notes

A full-stack **Google Docs Lite** application where multiple users can edit the same document simultaneously with real-time synchronization.

![Python](https://img.shields.io/badge/Python-3.9+-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688?style=flat-square&logo=fastapi&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-6c5ce7?style=flat-square)
![SQLite](https://img.shields.io/badge/SQLite-Database-003B57?style=flat-square&logo=sqlite&logoColor=white)

## Features

- **User Authentication** - Register/Login with JWT tokens
- **Document Management** - Create, edit, and delete documents
- **Document Sharing** - Share documents with other users by username
- **Real-Time Editing** - Multiple users edit simultaneously via WebSockets
- **Live Presence** - See who's currently editing the document
- **⌨Typing Indicators** - "Arif is typing..." real-time indicators
- **Version History** - Track and restore previous versions
- **Auto-Save** - Documents are automatically saved periodically
- **Responsive Design** - Works on desktop and mobile

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | FastAPI (Python) |
| **Real-Time** | WebSockets |
| **Database** | SQLite (async via aiosqlite) |
| **Auth** | JWT (python-jose + bcrypt) |
| **ORM** | SQLAlchemy (async) |
| **Frontend** | Vanilla HTML/CSS/JS |

## Engineering Skills Demonstrated

- **WebSockets** - Full-duplex real-time communication
- **Concurrency** - Async Python with asyncio
- **Conflict Resolution** - Last-write-wins with cursor position tracking
- **Real-Time Systems** - Live document synchronization
- **Authentication** - JWT-based stateless auth
- **RESTful API Design** - Clean, documented API endpoints
- **Database Design** - Normalized schema with relationships
- **Frontend Architecture** - Modular vanilla JS with separation of concerns

## Quick Start

### Prerequisites
- Python 3.9 or higher
- pip (Python package manager)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/arifekbalrashid/Collaborative-notes.git
cd Collaborative-notes

# 2. Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r backend/requirements.txt

# 4. Run the application
cd backend
python main.py
```

The app will be available at **http://localhost:8000**

### Usage

1. **Register** - Create an account with username, email, and password
2. **Create Document** - Click "New Document" on the dashboard
3. **Edit** - Start typing in the editor
4. **Share** - Click "Share" and enter another user's username
5. **Collaborate** - The other user opens the shared document and edits in real-time!

## Project Structure

```
Real-Time Collaborative Notes/
├── backend/
│   ├── main.py                 # FastAPI entry point
│   ├── config.py               # App configuration
│   ├── database.py             # SQLAlchemy async setup
│   ├── models.py               # ORM models (User, Document, etc.)
│   ├── schemas.py              # Pydantic request/response schemas
│   ├── auth.py                 # JWT authentication utilities
│   ├── routers/
│   │   ├── auth_router.py      # Login/Register endpoints
│   │   ├── document_router.py  # Document CRUD + sharing
│   │   └── ws_router.py        # WebSocket real-time editing
│   ├── services/
│   │   ├── collaboration.py    # Real-time session manager
│   │   └── document_service.py # Document business logic
│   └── requirements.txt
├── frontend/
│   ├── index.html              # Login/Register page
│   ├── dashboard.html          # Document dashboard
│   ├── editor.html             # Collaborative editor
│   ├── css/styles.css          # Design system
│   └── js/
│       ├── api.js              # API client
│       ├── auth.js             # Auth logic
│       ├── dashboard.js        # Dashboard logic
│       └── editor.js           # Editor + WebSocket logic
├── .gitignore
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/documents/` | Create document |
| GET | `/api/documents/` | List documents |
| GET | `/api/documents/{id}` | Get document |
| PUT | `/api/documents/{id}` | Update document |
| DELETE | `/api/documents/{id}` | Delete document |
| POST | `/api/documents/{id}/share` | Share document |
| GET | `/api/documents/{id}/versions` | Version history |
| WS | `/ws/{document_id}?token=JWT` | Real-time editing |

## WebSocket Protocol

Messages sent over WebSocket follow this format:

```json
// Client → Server: Edit
{"type": "edit", "content": "Updated document text..."}

// Client → Server: Typing indicator
{"type": "typing", "is_typing": true}

// Client → Server: Save
{"type": "save", "content": "Document content to save"}

// Server → Client: User joined
{"type": "user_joined", "username": "arif", "active_users": [...]}

// Server → Client: Remote edit
{"type": "edit", "content": "...", "username": "rahul"}
```

## License

MIT License - feel free to use this project for your portfolio!

---