# Create Digital Twin - Documentation

![Version](https://img.shields.io/badge/version-0.2.5-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![License](https://img.shields.io/badge/license-MIT-green)

> **CLI tool to scaffold Digital Twin applications with digitaltwin-core framework**

## Table of Contents

- [Overview](#overview)
- [Installation Methods](#installation-methods)
- [Quick Start](#quick-start)
- [Project Templates](#project-templates)
- [Configuration Options](#configuration-options)
- [Generated Project Structure](#generated-project-structure)
- [Database Support](#database-support)
- [Storage Options](#storage-options)
- [Docker Integration](#docker-integration)
- [Example Components](#example-components)
- [CLI Commands](#cli-commands)
- [Development](#development)
- [Architecture](#architecture)

## Overview

`create-digitaltwin` is a command-line tool that generates complete Digital Twin applications using the [digitaltwin-core](https://github.com/CePseudoBE/digital-twin-core) framework. It provides interactive prompts to configure your project with the right database, storage, and feature options.

### Key Features

- **Multiple Installation Methods** - Support for `npx`, `npm init`, and `yarn create`
- **Interactive Configuration** - User-friendly prompts for all project settings
- **Database Flexibility** - SQLite for development, PostgreSQL for production
- **Storage Options** - Local filesystem or S3-compatible object storage
- **Docker Ready** - Optional Docker and docker-compose configuration
- **Example Components** - Working examples with JSONPlaceholder API
- **Development Tools** - Built-in CLI commands for testing and development
- **Complete Documentation** - Generated README with setup instructions

## Installation Methods

### Using npx (Recommended)

```bash
npx create-digitaltwin my-digitaltwin-app
```

### Using npm init

```bash
npm init digitaltwin my-digitaltwin-app
```

### Using yarn create

```bash
yarn create digitaltwin my-digitaltwin-app
cd my-digitaltwin-app
yarn install
yarn dev
```

### Global Installation

```bash
npm install -g create-digitaltwin
create-digitaltwin my-digitaltwin-app
```

## 🏃 Quick Start

1. **Create your project:**
   ```bash
   npm init digitaltwin my-weather-station
   cd my-weather-station
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   # Edit the generated ..env file with your settings
   ```

4. **Start development:**
   ```bash
   npm run dev
   ```

5. **Test your setup:**
   ```bash
   node dt test  # Dry-run validation
   ```

Your Digital Twin application will be running at `http://localhost:3000`!

## Project Templates

### Available Configurations

The CLI generates different project templates based on your choices:

| Configuration | Database | Storage | Queue | Use Case |
|---------------|----------|---------|-------|----------|
| **Development** | SQLite | Local Files | In-memory | Quick prototyping |
| **Production** | PostgreSQL | S3 storage | Redis | Scalable deployment |
| **Hybrid** | PostgreSQL | Local Files | Redis | Cost-effective production |
| **Cloud-First** | PostgreSQL | S3 storage | In-memory | Simple cloud deployment |

### Template Features

- **TypeScript Configuration** - Modern ES2022 with strict mode
- **Environment Validation** - Type-safe environment variable checking
- **Development Scripts** - Hot reload and testing commands
- **Production Ready** - Build and deployment configuration
- **Docker Support** - Optional containerization setup
- **Example Components** - Working data collectors and processors

## Configuration Options

### Interactive Prompts

The CLI guides you through these configuration choices:

#### 1. Project Name
```
Project name: my-digitaltwin-app
```
- Must contain only lowercase letters, numbers, hyphens, and underscores
- Used for directory name, package name, and default configurations

#### 2. Database Selection
```
Choose your database:
❯ SQLite (File-based, good for development)
  PostgreSQL (Production-ready)
```

**SQLite Benefits:**
- No setup required
- Perfect for development and testing
- Single file database
- Zero configuration

**PostgreSQL Benefits:**
- Production-grade performance
- Advanced features and indexing
- Better concurrent access
- Industry standard

#### 3. Storage Service
```
Choose your storage service:
❯ Local Storage (File system)  
  S3-compatible object storage (AWS S3, MinIO, Scaleway, ...)
```

**Local Storage:**
- Simple file system storage
- No external dependencies
- Perfect for development
- Customizable directory path

**S3-compatible object storage:**
- Any provider with an S3 API (AWS S3, MinIO, Scaleway, ...)
- Scalable and reliable
- Optional CDN or custom domain for public links (`S3_PUBLIC_URL`)

#### 4. Redis Queue Management
```
Use Redis for queue management? (Y/n)
```
- **Yes**: Background job processing with BullMQ
- **No**: In-memory queue processing (simpler setup)

#### 5. Docker Configuration
```
Include Docker configuration? (y/N)
```
- Generates `Dockerfile` and `docker-compose.yml`
- Multi-service setup with database and Redis
- Production-ready container configuration

#### 6. Example Components
```
Include example components? (Y/n)
```
- JSONPlaceholder API collector
- Working data processing examples
- Demonstrates best practices

## 📁 Generated Project Structure

```
my-digitaltwin-app/
├── src/
│   ├── components/           # Digital Twin components
│   │   ├── jsonplaceholder_collector.ts
│   │   └── index.ts
│   ├── index.ts             # Main application entry
│   └── dt-cli.ts            # Development CLI tool
├── dist/                    # Compiled JavaScript
├── data/                    # SQLite database files
├── uploads/                 # Local storage directory
├── package.json            # Project configuration
├── tsconfig.json           # TypeScript configuration
├── .env                    # Environment variables template
├── .gitignore             # Git ignore rules
├── README.md              # Project documentation
├── Dockerfile             # Docker configuration (optional)
└── docker-compose.yml     # Multi-service setup (optional)
```

## Database Support

### SQLite Configuration

Generated for development and simple deployments:

```typescript
const database = await KyselyDatabaseAdapter.forSQLite({
  filename: env.DB_PATH || './data/my-app.db'
}, url => storage.retrieve(url))
```

**Environment Variables:**
```env
DB_PATH=./data/my-app.db
```

### PostgreSQL Configuration

Generated for production deployments:

```typescript
const database = await KyselyDatabaseAdapter.forPostgreSQL({
  host: env.DB_HOST,
  port: env.DB_PORT || 5432,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME
}, url => storage.retrieve(url))
```

**Environment Variables:**
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=my-app
```

## Storage Options

### Local File Storage

Simple filesystem-based storage:

```typescript
const storage = new LocalStorageService('./uploads')
```

**Configuration:**
```env
STORAGE_PATH=./uploads
```

**Benefits:**
- Zero external dependencies
- Simple file management
- Perfect for development
- Direct file system access

### S3-compatible object storage

Any storage with an S3 API (AWS S3, MinIO, Scaleway, ...):

```typescript
const storage = new S3StorageService({
  accessKey: env.S3_ACCESS_KEY_ID,
  secretKey: env.S3_SECRET_ACCESS_KEY,
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  bucket: env.S3_BUCKET,
  pathStyle: env.S3_FORCE_PATH_STYLE,
  publicUrl: env.S3_PUBLIC_URL
})
```

**Configuration:**
```env
S3_ENDPOINT=https://s3.example.com
S3_REGION=us-east-1
S3_BUCKET=my-app-storage
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
# S3_FORCE_PATH_STYLE=true              # MinIO
# S3_PUBLIC_URL=https://cdn.example.com # CDN or custom domain
```

**Benefits:**
- Scalable cloud storage
- CDN integration
- High availability
- S3-compatible API

## 🐳 Docker Integration

When Docker support is enabled, the CLI generates:

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY .env ./

EXPOSE 3000

CMD ["npm", "start"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - postgres  # If PostgreSQL selected
      - redis     # If Redis enabled
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads

  postgres:     # If PostgreSQL selected
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: my-app
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:        # If Redis enabled
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

### Docker Commands

```bash
# Build and start all services
docker-compose up --build

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

## 📝 Example Components

### JSONPlaceholder Collector

Generated when examples are enabled:

```typescript
export class JSONPlaceholderCollector extends Collector {
  getConfiguration() {
    return {
      name: 'jsonplaceholder-collector',
      description: 'Collects posts and users data from JSONPlaceholder API',
      contentType: 'application/json',
      endpoint: 'api/jsonplaceholder',
      tags: ['api', 'external', 'demo']
    }
  }
  
  async collect(): Promise<Buffer> {
    // Fetch posts and users concurrently
    const [postsResponse, usersResponse] = await Promise.all([
      fetch('https://jsonplaceholder.typicode.com/posts?_limit=10'),
      fetch('https://jsonplaceholder.typicode.com/users')
    ])
    
    const posts = await postsResponse.json()
    const users = await usersResponse.json()
    
    const data = {
      timestamp: new Date(),
      source: 'jsonplaceholder',
      posts,
      users,
      metadata: {
        postsCount: posts.length,
        usersCount: users.length,
        collectionDuration: Date.now() - startTime
      }
    }
    
    return Buffer.from(JSON.stringify(data, null, 2))
  }
  
  getSchedule(): string {
    return '*/15 * * * * *' // Every 15 seconds
  }
}
```

### Available Endpoints

After running the generated project:

- `GET /api/jsonplaceholder` - Latest collected data
- `GET /health` - Engine health status
- `GET /metrics` - System metrics

## CLI Commands

### Generated Project Commands

The generated project includes a custom CLI tool (`dt`):

```bash
# Run dry-run validation (no database changes)
node dt test

# Start development server
node dt dev

# Standard npm scripts
npm run build     # Compile TypeScript
npm run dev       # Development with hot reload  
npm start         # Production server
```

### Development Workflow

```bash
# 1. Create and setup project
npm init digitaltwin weather-station
cd weather-station
npm install

# 2. Configure environment
cp ..env ..env.local
# Edit ..env.local with your settings

# 3. Test configuration
node dt test

# 4. Start development
npm run dev

# 5. Build for production
npm run build
npm start
```

## 🔧 Development

### Building from Source

```bash
git clone https://github.com/CePseudoBE/create-digitaltwin
cd create-digitaltwin
npm install
npm run build
```

### Testing the CLI

```bash
# Link for local testing
npm link

# Test the CLI
create-digitaltwin test-project

# Run in development mode
npm run dev test-project
```

### Adding New Templates

1. **Extend ProjectAnswers interface** in `src/types/project-config.ts`
2. **Add prompt configuration** in `src/prompts.ts`
3. **Update generators** in `src/generators/project.ts`
4. **Test the new template** with various configurations

## Architecture

### Core Components

```
create-digitaltwin/
├── src/
│   ├── cli.ts              # Main CLI orchestration
│   ├── prompts.ts          # Interactive user prompts
│   ├── generators/         # Code generation logic
│   │   └── project.ts      # Project template generator
│   ├── types/              # TypeScript definitions
│   │   ├── index.ts        # Type exports
│   │   └── project-config.ts # Configuration interfaces
│   └── index.ts            # CLI entry point
```

### Code Generation Flow

1. **CLI Entry** (`index.ts`) → Starts the application
2. **User Prompts** (`prompts.ts`) → Collects configuration
3. **Project Generation** (`generators/project.ts`) → Creates files
4. **Template Processing** → Generates code based on answers
5. **File Writing** → Creates complete project structure

### Template System

The generator uses conditional template generation:

```typescript
// Database-specific code generation
const dbConfig = database === 'postgresql' 
  ? generatePostgreSQLConfig(answers)
  : generateSQLiteConfig(answers)

// Storage-specific imports
const storageClass = storage === 'local' 
  ? 'LocalStorageService' 
  : 'S3StorageService'

// Feature-based file generation
if (answers.includeDocker) {
  await generateDockerFiles(projectPath, answers)
}
```

### Environment Validation

Generated projects use type-safe environment validation:

```typescript
const env = Env.validate({
  PORT: Env.schema.number({ optional: true }),
  DB_HOST: Env.schema.string(),
  STORAGE_PATH: Env.schema.string({ optional: true }),
})
```

---

## Support & Contributing

- **GitHub**: [https://github.com/CePseudoBE/create-digitaltwin](https://github.com/CePseudoBE/create-digitaltwin)
- **Issues**: Report bugs and request features
- **Core Framework**: [digitaltwin-core](https://github.com/CePseudoBE/digital-twin-core)
- **License**: MIT - feel free to use in commercial projects

### Development Setup

```bash
git clone https://github.com/CePseudoBE/create-digitaltwin
cd create-digitaltwin
npm install
npm run build  # Build TypeScript
npm link       # Link for local testing
```

---

*Built by [Axel Hoffmann](https://github.com/CePseudoBE)*