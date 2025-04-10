-- Add is_vectorized column to projects_activities table
ALTER TABLE projects_activities ADD COLUMN is_vectorized INTEGER NOT NULL DEFAULT 0; 