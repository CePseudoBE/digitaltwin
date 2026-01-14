# Custom Table Manager Documentation

The CustomTableManager is a powerful component of the Digital Twin framework that provides structured data management with automatic CRUD operations and support for custom business logic endpoints.

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Basic Usage](#basic-usage)
4. [Database Table Configuration](#database-table-configuration)
5. [Automatic CRUD Endpoints](#automatic-crud-endpoints)
6. [Custom Business Logic Endpoints](#custom-business-logic-endpoints)
7. [Built-in Query Methods](#built-in-query-methods)
8. [Validation and Security](#validation-and-security)
9. [Complete Examples](#complete-examples)
10. [Best Practices](#best-practices)

## Overview

The CustomTableManager is an abstract base class that allows you to create components for managing structured data in custom database tables. It combines the power of automatic CRUD operations with the flexibility of custom business logic endpoints.

Unlike other components in the framework that work with files or external APIs, the CustomTableManager focuses exclusively on structured data management within your database.

## Key Features

- **Automatic Table Creation**: Define your table schema with custom columns and SQL types
- **Built-in CRUD Operations**: Get full REST API automatically (GET, POST, PUT, DELETE)
- **Custom Endpoints**: Add your own business logic endpoints alongside the standard ones
- **Query Validation**: Built-in validation system for data integrity
- **Advanced Search**: Multiple search methods with filtering and validation
- **Type Safety**: Full TypeScript support with proper typing
- **Database Agnostic**: Works with any database supported by Knex.js

## Basic Usage

To create a CustomTableManager, extend the base class and implement the `getConfiguration()` method:

```typescript
import { CustomTableManager } from 'digitaltwin-core'

class ProductsManager extends CustomTableManager {
  getConfiguration() {
    return {
      name: 'products',
      description: 'Product inventory management',
      columns: {
        'product_name': 'text not null',
        'sku': 'varchar(50) unique not null',
        'price': 'decimal not null',
        'stock_quantity': 'integer default 0',
        'is_active': 'boolean default true',
        'category': 'text',
        'created_by': 'text'
      }
    }
  }
}

// Register with Digital Twin Engine
const engine = new DigitalTwinEngine({
  customTableManagers: [new ProductsManager()],
  // ... other configuration
})
```

## Database Table Configuration

### Column Types

The CustomTableManager supports various SQL column types:

| Type | Description | Example |
|------|-------------|---------|
| `text` | Variable length text | `'description': 'text'` |
| `text not null` | Required text field | `'name': 'text not null'` |
| `varchar(N)` | Fixed length text | `'sku': 'varchar(50)'` |
| `integer` | Whole numbers | `'quantity': 'integer'` |
| `boolean` | True/false values | `'active': 'boolean'` |
| `boolean default true` | Boolean with default | `'published': 'boolean default true'` |
| `decimal` / `real` / `float` | Decimal numbers | `'price': 'decimal'` |
| `datetime` / `timestamp` | Date and time | `'expires_at': 'datetime'` |

### Standard Columns

Every CustomTableManager table automatically includes these standard columns:
- `id` - Primary key (auto-increment)
- `created_at` - Record creation timestamp
- `updated_at` - Last modification timestamp

### Example Configuration

```typescript
getConfiguration() {
  return {
    name: 'inventory_items',
    description: 'Warehouse inventory management',
    columns: {
      // Required fields
      'item_name': 'text not null',
      'barcode': 'varchar(128) unique not null',
      
      // Optional fields with defaults
      'quantity': 'integer default 0',
      'is_active': 'boolean default true',
      'category': 'text default "uncategorized"',
      
      // Decimal and date fields
      'unit_price': 'decimal',
      'last_restocked': 'datetime',
      
      // User tracking
      'created_by': 'text',
      'warehouse_location': 'varchar(10)'
    }
  }
}
```

## Automatic CRUD Endpoints

Every CustomTableManager automatically provides these REST endpoints:

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| GET | `/{name}` | List all records | None | Array of records |
| POST | `/{name}` | Create new record | Record data | Created record with ID |
| GET | `/{name}/{id}` | Get specific record | None | Single record or 404 |
| PUT | `/{name}/{id}` | Update record | Updated fields | Success message |
| DELETE | `/{name}/{id}` | Delete record | None | Success message |

### Example API Usage

```bash
# List all products
GET /products
Response: [
  {
    "id": 1,
    "product_name": "Laptop",
    "sku": "LAP001",
    "price": 999.99,
    "stock_quantity": 5,
    "is_active": true,
    "created_at": "2024-01-15T10:00:00Z",
    "updated_at": "2024-01-15T10:00:00Z"
  }
]

# Create new product
POST /products
Body: {
  "product_name": "Desktop PC",
  "sku": "DES001",
  "price": 1299.99,
  "stock_quantity": 3,
  "category": "computers"
}

# Update product
PUT /products/1
Body: {
  "price": 899.99,
  "stock_quantity": 8
}

# Delete product
DELETE /products/1
```

## Custom Business Logic Endpoints

Add custom endpoints by defining them in your configuration and implementing the corresponding methods:

```typescript
class OrdersManager extends CustomTableManager {
  getConfiguration() {
    return {
      name: 'orders',
      description: 'Order management system',
      columns: {
        'order_number': 'varchar(50) unique not null',
        'customer_email': 'text not null',
        'total_amount': 'decimal not null',
        'status': 'text default "pending"',
        'items_json': 'text', // JSON string of order items
        'shipping_address': 'text'
      },
      // Define custom endpoints
      endpoints: [
        { path: '/bulk-create', method: 'post', handler: 'createBulkOrders' },
        { path: '/by-status/:status', method: 'get', handler: 'getOrdersByStatus' },
        { path: '/calculate-total/:id', method: 'put', handler: 'recalculateTotal' },
        { path: '/customer/:email', method: 'get', handler: 'getCustomerOrders' },
        { path: '/analytics', method: 'get', handler: 'getOrderAnalytics' }
      ]
    }
  }

  // Custom endpoint: Create multiple orders at once
  async createBulkOrders(req: any): Promise<DataResponse> {
    try {
      const { orders } = req.body
      
      if (!Array.isArray(orders) || orders.length === 0) {
        return {
          status: 400,
          content: JSON.stringify({ error: 'Orders array is required' }),
          headers: { 'Content-Type': 'application/json' }
        }
      }

      const results = []
      for (const orderData of orders) {
        // Validate required fields
        if (!orderData.order_number || !orderData.customer_email) {
          throw new Error('order_number and customer_email are required for each order')
        }

        // Use built-in create method
        const id = await this.create({
          order_number: orderData.order_number,
          customer_email: orderData.customer_email,
          total_amount: orderData.total_amount || 0,
          status: orderData.status || 'pending',
          items_json: JSON.stringify(orderData.items || []),
          shipping_address: orderData.shipping_address || ''
        })
        
        results.push({ id, order_number: orderData.order_number })
      }

      return {
        status: 201,
        content: JSON.stringify({
          message: `Created ${results.length} orders successfully`,
          orders: results
        }),
        headers: { 'Content-Type': 'application/json' }
      }
    } catch (error) {
      return {
        status: 400,
        content: JSON.stringify({ error: error.message }),
        headers: { 'Content-Type': 'application/json' }
      }
    }
  }

  // Custom endpoint: Get orders by status
  async getOrdersByStatus(req: any): Promise<DataResponse> {
    try {
      const { status } = req.params
      const { limit = 50, offset = 0 } = req.query

      // Use built-in search with validation
      const orders = await this.findByColumn('status', status)
      
      // Apply pagination
      const paginatedOrders = orders.slice(
        parseInt(offset), 
        parseInt(offset) + parseInt(limit)
      )

      return {
        status: 200,
        content: JSON.stringify({
          orders: paginatedOrders,
          total: orders.length,
          status,
          pagination: { limit: parseInt(limit), offset: parseInt(offset) }
        }),
        headers: { 'Content-Type': 'application/json' }
      }
    } catch (error) {
      return {
        status: 500,
        content: JSON.stringify({ error: error.message }),
        headers: { 'Content-Type': 'application/json' }
      }
    }
  }

  // Custom endpoint: Recalculate order total
  async recalculateTotal(req: any): Promise<DataResponse> {
    try {
      const { id } = req.params
      const order = await this.findById(parseInt(id))

      if (!order) {
        return {
          status: 404,
          content: JSON.stringify({ error: 'Order not found' }),
          headers: { 'Content-Type': 'application/json' }
        }
      }

      // Parse items and recalculate
      const items = JSON.parse(order.items_json || '[]')
      const newTotal = items.reduce((sum: number, item: any) => {
        return sum + (item.price * item.quantity)
      }, 0)

      // Update the order
      await this.update(parseInt(id), { total_amount: newTotal })

      return {
        status: 200,
        content: JSON.stringify({
          message: 'Order total recalculated',
          order_id: id,
          old_total: order.total_amount,
          new_total: newTotal
        }),
        headers: { 'Content-Type': 'application/json' }
      }
    } catch (error) {
      return {
        status: 500,
        content: JSON.stringify({ error: error.message }),
        headers: { 'Content-Type': 'application/json' }
      }
    }
  }

  // Custom endpoint: Get analytics
  async getOrderAnalytics(req: any): Promise<DataResponse> {
    try {
      const allOrders = await this.findAll()
      
      const analytics = {
        total_orders: allOrders.length,
        total_revenue: allOrders.reduce((sum, order) => sum + parseFloat(order.total_amount || '0'), 0),
        status_breakdown: {},
        average_order_value: 0
      }

      // Calculate status breakdown
      const statusCounts: Record<string, number> = {}
      allOrders.forEach(order => {
        const status = order.status || 'unknown'
        statusCounts[status] = (statusCounts[status] || 0) + 1
      })
      analytics.status_breakdown = statusCounts

      // Calculate average order value
      if (allOrders.length > 0) {
        analytics.average_order_value = analytics.total_revenue / allOrders.length
      }

      return {
        status: 200,
        content: JSON.stringify(analytics),
        headers: { 'Content-Type': 'application/json' }
      }
    } catch (error) {
      return {
        status: 500,
        content: JSON.stringify({ error: error.message }),
        headers: { 'Content-Type': 'application/json' }
      }
    }
  }
}
```

## Built-in Query Methods

The CustomTableManager provides several built-in methods for data operations:

### Create Operations
```typescript
// Create a single record
const id = await this.create({
  product_name: 'New Product',
  sku: 'PROD001',
  price: 29.99
})
```

### Read Operations
```typescript
// Get all records
const allProducts = await this.findAll()

// Get record by ID
const product = await this.findById(123)

// Search by single column
const activeProducts = await this.findByColumn('is_active', true)

// Advanced search with multiple conditions
const expensiveElectronics = await this.findByColumns({
  category: 'electronics',
  price: { '>': 100 }  // Advanced operators (if supported by your database)
})

// Search with validation
const validatedResults = await this.findByColumns(
  { category: searchCategory },
  {
    required: ['category'],
    validate: (conditions) => {
      if (conditions.category.length < 2) {
        throw new Error('Category must be at least 2 characters')
      }
    }
  }
)
```

### Update Operations
```typescript
// Update single record
await this.update(123, {
  price: 39.99,
  stock_quantity: 15
})
```

### Delete Operations
```typescript
// Delete single record
await this.delete(123)

// Delete by condition
const deletedCount = await this.deleteByCondition({ is_active: false })
```

## Validation and Security

### Query Validation
The CustomTableManager includes built-in validation for queries:

```typescript
// Example with validation options
async searchProducts(req: any): Promise<DataResponse> {
  const { category, min_price } = req.query

  const products = await this.findByColumns(
    { category, price: min_price },
    {
      // Required fields
      required: ['category'],
      
      // Custom validation function
      validate: (conditions) => {
        if (conditions.min_price && conditions.min_price < 0) {
          throw new Error('Minimum price cannot be negative')
        }
        
        if (conditions.category && conditions.category.length < 2) {
          throw new Error('Category must be at least 2 characters')
        }
      }
    }
  )

  return {
    status: 200,
    content: JSON.stringify({ products }),
    headers: { 'Content-Type': 'application/json' }
  }
}
```

### Input Sanitization
Always sanitize and validate input data in your custom endpoints:

```typescript
async createProduct(req: any): Promise<DataResponse> {
  try {
    const { product_name, sku, price } = req.body

    // Validation
    if (!product_name || product_name.trim().length === 0) {
      return {
        status: 400,
        content: JSON.stringify({ error: 'Product name is required' }),
        headers: { 'Content-Type': 'application/json' }
      }
    }

    if (price < 0) {
      return {
        status: 400,
        content: JSON.stringify({ error: 'Price cannot be negative' }),
        headers: { 'Content-Type': 'application/json' }
      }
    }

    // Sanitize input
    const sanitizedData = {
      product_name: product_name.trim(),
      sku: sku?.trim().toUpperCase(),
      price: parseFloat(price)
    }

    const id = await this.create(sanitizedData)

    return {
      status: 201,
      content: JSON.stringify({ id, message: 'Product created successfully' }),
      headers: { 'Content-Type': 'application/json' }
    }
  } catch (error) {
    return {
      status: 500,
      content: JSON.stringify({ error: error.message }),
      headers: { 'Content-Type': 'application/json' }
    }
  }
}
```

## Complete Examples

### Example 1: User Preferences Manager

```typescript
class UserPreferencesManager extends CustomTableManager {
  getConfiguration() {
    return {
      name: 'user_preferences',
      description: 'User preferences and settings',
      columns: {
        'user_id': 'text not null',
        'preference_key': 'varchar(100) not null',
        'preference_value': 'text',
        'data_type': 'varchar(20) default "string"', // string, number, boolean, json
        'category': 'text default "general"'
      },
      endpoints: [
        { path: '/user/:userId', method: 'get', handler: 'getUserPreferences' },
        { path: '/user/:userId/set', method: 'post', handler: 'setUserPreference' },
        { path: '/user/:userId/category/:category', method: 'get', handler: 'getUserPreferencesByCategory' },
        { path: '/defaults', method: 'get', handler: 'getDefaultPreferences' }
      ]
    }
  }

  async getUserPreferences(req: any): Promise<DataResponse> {
    try {
      const { userId } = req.params
      const preferences = await this.findByColumn('user_id', userId)
      
      // Convert to key-value object
      const prefsObject = preferences.reduce((acc, pref) => {
        let value = pref.preference_value
        
        // Convert based on data type
        switch (pref.data_type) {
          case 'number':
            value = parseFloat(value)
            break
          case 'boolean':
            value = value === 'true'
            break
          case 'json':
            try {
              value = JSON.parse(value)
            } catch {
              value = pref.preference_value
            }
            break
        }
        
        acc[pref.preference_key] = {
          value,
          category: pref.category,
          updated_at: pref.updated_at
        }
        return acc
      }, {})

      return {
        status: 200,
        content: JSON.stringify({ user_id: userId, preferences: prefsObject }),
        headers: { 'Content-Type': 'application/json' }
      }
    } catch (error) {
      return {
        status: 500,
        content: JSON.stringify({ error: error.message }),
        headers: { 'Content-Type': 'application/json' }
      }
    }
  }

  async setUserPreference(req: any): Promise<DataResponse> {
    try {
      const { userId } = req.params
      const { key, value, category = 'general' } = req.body

      if (!key || value === undefined) {
        return {
          status: 400,
          content: JSON.stringify({ error: 'Key and value are required' }),
          headers: { 'Content-Type': 'application/json' }
        }
      }

      // Determine data type
      let dataType = 'string'
      let stringValue = String(value)

      if (typeof value === 'number') {
        dataType = 'number'
      } else if (typeof value === 'boolean') {
        dataType = 'boolean'
        stringValue = value ? 'true' : 'false'
      } else if (typeof value === 'object') {
        dataType = 'json'
        stringValue = JSON.stringify(value)
      }

      // Check if preference exists
      const existing = await this.findByColumns({
        user_id: userId,
        preference_key: key
      })

      if (existing.length > 0) {
        // Update existing
        await this.update(existing[0].id, {
          preference_value: stringValue,
          data_type: dataType,
          category
        })
      } else {
        // Create new
        await this.create({
          user_id: userId,
          preference_key: key,
          preference_value: stringValue,
          data_type: dataType,
          category
        })
      }

      return {
        status: 200,
        content: JSON.stringify({ 
          message: 'Preference saved successfully',
          key,
          value,
          category
        }),
        headers: { 'Content-Type': 'application/json' }
      }
    } catch (error) {
      return {
        status: 500,
        content: JSON.stringify({ error: error.message }),
        headers: { 'Content-Type': 'application/json' }
      }
    }
  }
}
```

### Example 2: Task Management System

```typescript
class TasksManager extends CustomTableManager {
  getConfiguration() {
    return {
      name: 'tasks',
      description: 'Task management system',
      columns: {
        'title': 'text not null',
        'description': 'text',
        'status': 'varchar(20) default "todo"', // todo, in_progress, done, cancelled
        'priority': 'varchar(10) default "medium"', // low, medium, high, urgent
        'assigned_to': 'text',
        'due_date': 'datetime',
        'estimated_hours': 'decimal',
        'actual_hours': 'decimal default 0',
        'project_id': 'text',
        'tags': 'text' // JSON array as string
      },
      endpoints: [
        { path: '/by-status/:status', method: 'get', handler: 'getTasksByStatus' },
        { path: '/by-assignee/:assignee', method: 'get', handler: 'getTasksByAssignee' },
        { path: '/overdue', method: 'get', handler: 'getOverdueTasks' },
        { path: '/:id/start', method: 'put', handler: 'startTask' },
        { path: '/:id/complete', method: 'put', handler: 'completeTask' },
        { path: '/:id/log-time', method: 'post', handler: 'logTime' },
        { path: '/stats', method: 'get', handler: 'getTaskStats' }
      ]
    }
  }

  async startTask(req: any): Promise<DataResponse> {
    try {
      const { id } = req.params
      const task = await this.findById(parseInt(id))

      if (!task) {
        return {
          status: 404,
          content: JSON.stringify({ error: 'Task not found' }),
          headers: { 'Content-Type': 'application/json' }
        }
      }

      if (task.status === 'done') {
        return {
          status: 400,
          content: JSON.stringify({ error: 'Cannot start a completed task' }),
          headers: { 'Content-Type': 'application/json' }
        }
      }

      await this.update(parseInt(id), { status: 'in_progress' })

      return {
        status: 200,
        content: JSON.stringify({ 
          message: 'Task started successfully',
          task_id: id,
          title: task.title
        }),
        headers: { 'Content-Type': 'application/json' }
      }
    } catch (error) {
      return {
        status: 500,
        content: JSON.stringify({ error: error.message }),
        headers: { 'Content-Type': 'application/json' }
      }
    }
  }

  async getOverdueTasks(req: any): Promise<DataResponse> {
    try {
      const allTasks = await this.findAll()
      const now = new Date()
      
      const overdueTasks = allTasks.filter(task => {
        if (!task.due_date || task.status === 'done' || task.status === 'cancelled') {
          return false
        }
        
        const dueDate = new Date(task.due_date)
        return dueDate < now
      })

      // Sort by due date (most overdue first)
      overdueTasks.sort((a, b) => {
        const dateA = new Date(a.due_date).getTime()
        const dateB = new Date(b.due_date).getTime()
        return dateA - dateB
      })

      return {
        status: 200,
        content: JSON.stringify({
          overdue_tasks: overdueTasks,
          count: overdueTasks.length
        }),
        headers: { 'Content-Type': 'application/json' }
      }
    } catch (error) {
      return {
        status: 500,
        content: JSON.stringify({ error: error.message }),
        headers: { 'Content-Type': 'application/json' }
      }
    }
  }

  async getTaskStats(req: any): Promise<DataResponse> {
    try {
      const allTasks = await this.findAll()
      
      const stats = {
        total: allTasks.length,
        by_status: {},
        by_priority: {},
        overdue_count: 0,
        total_estimated_hours: 0,
        total_actual_hours: 0,
        completion_rate: 0
      }

      const now = new Date()
      let completedTasks = 0

      allTasks.forEach(task => {
        // Status breakdown
        const status = task.status || 'todo'
        stats.by_status[status] = (stats.by_status[status] || 0) + 1

        // Priority breakdown
        const priority = task.priority || 'medium'
        stats.by_priority[priority] = (stats.by_priority[priority] || 0) + 1

        // Hours tracking
        stats.total_estimated_hours += parseFloat(task.estimated_hours || '0')
        stats.total_actual_hours += parseFloat(task.actual_hours || '0')

        // Overdue check
        if (task.due_date && task.status !== 'done' && task.status !== 'cancelled') {
          const dueDate = new Date(task.due_date)
          if (dueDate < now) {
            stats.overdue_count++
          }
        }

        // Completion tracking
        if (task.status === 'done') {
          completedTasks++
        }
      })

      stats.completion_rate = allTasks.length > 0 ? (completedTasks / allTasks.length * 100) : 0

      return {
        status: 200,
        content: JSON.stringify(stats),
        headers: { 'Content-Type': 'application/json' }
      }
    } catch (error) {
      return {
        status: 500,
        content: JSON.stringify({ error: error.message }),
        headers: { 'Content-Type': 'application/json' }
      }
    }
  }
}
```

## Best Practices

### 1. Naming Conventions
```typescript
// Good: Clear, descriptive names
class UserPreferencesManager extends CustomTableManager {
  getConfiguration() {
    return {
      name: 'user_preferences',  // Snake case for table names
      columns: {
        'user_id': 'text not null',
        'preference_key': 'varchar(100)',
        'last_updated_by': 'text'
      }
    }
  }
}
```

### 2. Error Handling
```typescript
// Always handle errors gracefully
async customEndpoint(req: any): Promise<DataResponse> {
  try {
    // Your logic here
    return {
      status: 200,
      content: JSON.stringify({ success: true }),
      headers: { 'Content-Type': 'application/json' }
    }
  } catch (error) {
    // Log error for debugging
    console.error('CustomTableManager error:', error)
    
    return {
      status: 500,
      content: JSON.stringify({ 
        error: error.message,
        endpoint: 'customEndpoint'
      }),
      headers: { 'Content-Type': 'application/json' }
    }
  }
}
```

### 3. Input Validation
```typescript
// Always validate input data
async createRecord(req: any): Promise<DataResponse> {
  const { name, email, age } = req.body

  // Validation
  const errors = []
  
  if (!name || name.trim().length === 0) {
    errors.push('Name is required')
  }
  
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Valid email is required')
  }
  
  if (age && (age < 0 || age > 150)) {
    errors.push('Age must be between 0 and 150')
  }

  if (errors.length > 0) {
    return {
      status: 400,
      content: JSON.stringify({ errors }),
      headers: { 'Content-Type': 'application/json' }
    }
  }

  // Proceed with creation...
}
```

### 4. Response Consistency
```typescript
// Consistent response format
return {
  status: 200,
  content: JSON.stringify({
    success: true,
    data: result,
    message: 'Operation completed successfully',
    timestamp: new Date().toISOString()
  }),
  headers: { 'Content-Type': 'application/json' }
}
```

### 5. Use Built-in Methods
```typescript
// Good: Use built-in methods when possible
async getActiveItems(req: any): Promise<DataResponse> {
  try {
    // Use built-in search instead of raw SQL
    const items = await this.findByColumn('is_active', true)
    
    return {
      status: 200,
      content: JSON.stringify({ items }),
      headers: { 'Content-Type': 'application/json' }
    }
  } catch (error) {
    return {
      status: 500,
      content: JSON.stringify({ error: error.message }),
      headers: { 'Content-Type': 'application/json' }
    }
  }
}
```

The CustomTableManager is a powerful tool for building data-driven APIs with minimal boilerplate code while maintaining the flexibility to implement complex business logic when needed.