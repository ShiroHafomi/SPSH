# Student Performance & Study Habits Analysis Dashboard

A full-stack, server-rendered web application designed to analyze and manage student academic performance. This project leverages a schema-agnostic architecture to provide a dynamic dashboard and CRUD interface over the Kaggle "Student Performance & Study Habits" dataset.

## 🌟 Key Features

- **Schema-Agnostic Design**: The application automatically detects CSV columns at import time. There are no hardcoded column names in the app; it adapts its UI (tables, forms, and charts) based on a generated `schema_map.json`.
- **Interactive Dashboard**: High-level KPIs and data visualizations powered by Chart.js, automatically assigning chart roles based on semantic heuristics.
- **Student Management**: Full CRUD (Create, Read, Update, Delete) capabilities with server-side pagination, searching, and sorting.
- **AI-Powered Insights**: Integrated fine-tuned AI capabilities to analyze study habits and predict academic outcomes (final grades/scores) based on student behavior and demographics.
- **Robust Data Import**: A streaming CSV importer that handles MySQL STRICT mode and logs errors for invalid data rows.

## 🛠️ Tech Stack

- **Backend**: Node.js 22, Express.js
- **Frontend**: EJS (Embedded JavaScript templates), Tailwind CSS (via Play CDN), Chart.js
- **Database**: MySQL 8.0
- **AI/ML**: Fine-tuned AI model for performance prediction
- **Language**: JavaScript (Node.js)

## 🚀 Getting Started

### Prerequisites

- **Node.js**: Version 22 or later
- **MySQL**: Version 8.0+
- **Git**: For cloning the repository

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ShiroHafomi/SPSH.git
   cd SPSH
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file in the root directory:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and provide your MySQL credentials:
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=YourPassword
   DB_NAME=student_performance
   PORT=3000
   ```

### Database & Data Setup

The app handles database and table creation automatically during the import process.

1. **Import the sample dataset:**
   ```bash
   npm run import:sample
   ```
   *This will create the `student_performance` database, the `students` table, and the critical `schema_map.json` file.*

2. **(Optional) Import your own CSV:**
   ```bash
   npm run import -- --file path/to/your_dataset.csv --replace
   ```

### Running the Application

**Development mode (with auto-restart):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

Access the app at: `http://localhost:3000`

## 🧠 AI Integration

This project utilizes a fine-tuned AI model to provide predictive analytics. By analyzing features such as `study_time_hours`, `attendance_percent`, and `sleep_hours`, the AI helps identify students at risk and suggests improvements in study habits to optimize final exam scores.

## 🏗️ Architecture

The app follows a layered architecture:
`Browser` $\rightarrow$ `Express Routes` $\rightarrow$ `Controllers` $\rightarrow$ `Services (SQL)` $\rightarrow$ `mysql2 pool` $\rightarrow$ `MySQL`

The **`schema_map.json`** acts as the central contract between the data importer and the application, allowing the UI to remain flexible regardless of the input CSV structure.
