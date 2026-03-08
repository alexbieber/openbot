---
name: database
description: Query and manage a local SQLite database. Execute SQL queries, create tables, insert data, and export results. Use when user needs structured data storage, queries, or local database operations.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [query, execute, tables, schema, export]
      description: "query: SELECT. execute: INSERT/UPDATE/DELETE/CREATE. tables: list tables. schema: show table structure. export: export table to CSV"
    sql:
      type: string
      description: SQL statement to execute
    db:
      type: string
      description: Database file path (defaults to ~/.openbot/data.db)
    table:
      type: string
      description: Table name (for schema/export)
  required:
    - action
---
# Database Skill
Local SQLite database operations using better-sqlite3.
Default database: ~/.openbot/data.db
