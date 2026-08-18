<div align="center">

# 🌸 Dit Shop — Digital Gift Card Platform

**A modern, full-stack open-source e-commerce platform for digital gift cards and game vouchers.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Database: MySQL](https://img.shields.io/badge/database-MySQL%208.0-blue.svg)](https://www.mysql.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Features](#-key-features) • [Quick Start](#-quick-start) • [Docker](#-running-with-docker) • [API Documentation](#-api-endpoints) • [Contributing](#-contributing)

</div>

---

## ✨ Key Features

- 🛍️ **Digital Gift Card Catalog** — Browse, search, and filter gift cards by category, price, and region (Steam, Apple, Google Play, Netflix, Spotify, PlayStation, Xbox, and more).
- 💳 **Payment Proof Workflow** — Seamless QR-code payment flow with customer slip/receipt upload and verification.
- 💬 **Integrated Helpdesk / Inbox** — Built-in customer support ticketing system with threaded messaging.
- 🛡️ **JWT Security & RBAC** — Secure authentication, password hashing with bcrypt, role-based access (Customer & Admin), and route guards.
- 📊 **Comprehensive Admin Panel** — Full back-office dashboard to manage products, categories, stock, orders, payment approvals, and customer inquiries.
- 🎨 **Modern Glassmorphism UI** — High-aesthetic dark/glass design with micro-interactions, responsive on desktop, tablet, and mobile.
- 🐳 **Docker Ready** — 1-command startup with orchestrated MySQL 8.0 and Node.js backend.

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | [Node.js](https://nodejs.org/), [Express.js](https://expressjs.com/), [mysql2](https://github.com/sidorares/node-mysql2), [JWT](https://jwt.io/), [Multer](https://github.com/expressjs/multer), [bcryptjs](https://github.com/dcodeIO/bcrypt.js) |
| **Frontend** | Vanilla HTML5, Modern CSS3 (Custom Properties & Glassmorphism), ES6+ JavaScript, FontAwesome |
| **Database** | [MySQL 8.0](https://www.mysql.com/) / MariaDB |
| **DevOps** | [Docker](https://www.docker.com/), [Docker Compose](https://docs.docker.com/compose/) |

---

## 🚀 Quick Start

### Option 1: Running with Docker (Recommended)

Run the entire stack (Node.js backend + MySQL database) with a single command:

```bash
docker compose up -d
```

- Web App & API: **http://localhost:3000**
- MySQL Database: **localhost:3306** (auto-initialized with schema & admin seed)

To stop the containers:
```bash
docker compose down
```

---

### Option 2: Local Development (Windows / XAMPP)

#### 1. Prerequisites
- **Node.js** (v18.0.0 or higher)
- **MySQL** running (via [XAMPP](https://www.apachefriends.org/) or MySQL Server)

#### 2. Import Database
Import the SQL schema to create the `ditshop` database:
- **phpMyAdmin:** Navigate to `http://localhost/phpmyadmin` → Click **Import** → Choose [`database/schema.sql`](database/schema.sql) → Click **Import**.
- **Or via CLI:**
  ```cmd
  mysql -u root -p < database/schema.sql
  ```

#### 3. Configure Environment
```powershell
cd backend
copy .env.example .env
```
Edit `backend/.env` if your MySQL configuration differs:
```env
PORT=3000
DB_DRIVER=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=ditshop
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d
```

#### 4. Start the Application
You can use the convenient launch scripts:
- **Windows:** Double-click [`start.bat`](start.bat) or run `.\start.bat` in terminal.
- **Linux / macOS:** Run `chmod +x start.sh && ./start.sh`

Or run manually:
```bash
cd backend
npm install
npm run dev   # or npm start
```

Visit **http://localhost:3000** in your browser.

---

## 🔐 Default Admin Account

After importing the database schema, a default administrative account is available:

| Field | Value |
|---|---|
| **Login URL** | `http://localhost:3000/login.html` |
| **Username** | `Bandit` |
| **Email** | `nicklpb1123@gmail.com` |
| **Password** | `khamphet` |
| **Role** | `admin` (Redirects to `/admin/index.html`) |

> ⚠️ **Security Notice:** Please change this default password and `JWT_SECRET` before deploying to any production or public environment.

---

## 📁 Project Structure

```
dit-shop/
├── .github/                 # GitHub Issue & PR templates
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── pull_request_template.md
├── backend/                 # Express REST API Server
│   ├── config/              # Database connection adapter
│   ├── middleware/          # JWT auth & role validation
│   ├── routes/              # API route controllers
│   ├── Qr/                  # Payment QR code assets
│   ├── server.js            # Server entry point
│   ├── package.json         # Backend dependencies & scripts
│   └── .env.example         # Environment template
├── database/                # Database schemas & seeds
│   ├── schema.sql           # MySQL database schema & initial data
│   └── seed_admin.sql       # Admin user seed script
├── frontend/                # Client-side web application
│   ├── admin/               # Admin management portal
│   ├── components/          # Reusable UI widgets
│   ├── css/                 # Stylesheets & design tokens
│   ├── img/                 # Static brand & product images
│   ├── js/                  # Client logic & API integrations
│   ├── index.html           # Storefront homepage
│   ├── login.html           # Authentication page
│   ├── register.html        # User registration page
│   ├── profile.html         # User profile & order history
│   └── inbox.html           # Customer support inbox
├── Dockerfile               # Production Dockerfile
├── docker-compose.yml       # Full-stack Docker orchestration
├── start.bat / stop.bat     # Windows quick start / stop scripts
├── start.sh / stop.sh       # Unix quick start / stop scripts
├── CONTRIBUTING.md          # Contribution guidelines
├── CODE_OF_CONDUCT.md       # Contributor Covenant standard
├── SECURITY.md              # Security & vulnerability reporting
└── LICENSE                  # MIT License
```

---

## 📡 API Endpoints

### Authentication (`/api/auth`)
- `POST /api/auth/register` — Register a new customer account
- `POST /api/auth/login` — Login & retrieve JWT bearer token
- `GET  /api/auth/me` — Retrieve current authenticated user profile
- `PUT  /api/auth/profile` — Update user profile information

### Gift Cards (`/api/cards`)
- `GET  /api/cards` — List active gift cards (supports search, category, region filters)
- `GET  /api/cards/:id` — Get gift card details

### Orders (`/api/orders`)
- `POST /api/orders` — Create a new order
- `POST /api/orders/:id/payment` — Upload payment slip/proof
- `GET  /api/orders/my` — List authenticated user's order history
- `GET  /api/orders/:id` — Get detailed order invoice

### Customer Support (`/api/inbox`)
- `GET  /api/inbox/my` — Get user messages / support tickets
- `POST /api/inbox` — Submit support ticket or send message

### Admin Portal (`/api/admin`) *(Admin role required)*
- `GET  /api/admin/stats` — Dashboard statistics overview
- `GET  /api/admin/cards` — Manage gift card inventory
- `POST /api/admin/cards` — Create a new gift card
- `PUT  /api/admin/cards/:id` — Update gift card details
- `GET  /api/admin/orders` — View and review all customer orders
- `PUT  /api/admin/orders/:id/status` — Approve/Reject payment and complete orders
- `GET  /api/admin/inbox` — Manage and reply to customer inquiries

---

## 🤝 Contributing

Contributions make the open-source community an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Check out our [Contributing Guidelines](CONTRIBUTING.md).
2. Adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).
3. Open a [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) or [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) for discussions.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.
