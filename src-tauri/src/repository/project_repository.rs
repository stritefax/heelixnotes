use crate::entity::project::Project;
use rusqlite::{named_params, params, Connection};
use log::info;

pub fn delete_project(conn: &Connection, project_id: i64) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM projects WHERE id = ?1", params![project_id])?;
    delete_project_activities(conn, project_id)?;
    Ok(())
}

pub fn delete_project_activities(
    conn: &Connection,
    project_id: i64,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM projects_activities WHERE project_id = ?1",
        params![project_id],
    )?;
    Ok(())
}

pub fn save_project(
    conn: &Connection,
    name: &str,
    activities: &Vec<i64>,
) -> Result<(), rusqlite::Error> {
    let mut statement = conn.prepare("INSERT INTO projects (name) VALUES (@name)")?;

    statement.execute(named_params! {
        "@name": name
    })?;
    let project_id = conn.last_insert_rowid();

    // Only add activities if the vector is not empty
    if !activities.is_empty() {
        add_project_activities(conn, project_id, activities)?;
    }
    
    Ok(())
}

pub fn update_project(
    conn: &Connection,
    project_id: i64,
    name: &str,
    activities: &Vec<i64>,
) -> Result<(), rusqlite::Error> {
    // Update the project name first
    conn.execute(
        "UPDATE projects SET name = ?1 WHERE id = ?2",
        params![name, project_id],
    )?;
    
    // Only handle activities if they're provided
    if !activities.is_empty() {
        delete_project_activities(conn, project_id)?;
        add_project_activities(conn, project_id, activities)?;
    }
    
    Ok(())
}

// Modified function to handle tagging documents with projects instead of moving
pub fn tag_document_with_project(
    conn: &Connection,
    document_id: i64,
    project_id: i64,
) -> Result<(), rusqlite::Error> {
    // Check if this document-project association already exists
    let exists: bool = conn.query_row(
        "SELECT 1 FROM projects_activities 
         WHERE id = ?1 AND project_id = ?2 LIMIT 1",
        params![document_id, project_id],
        |_| Ok(true)
    ).unwrap_or(false);

    // If it doesn't exist, create the association
    if !exists {
        // First get the document details from its original location
        let (document_name, full_text) = conn.query_row(
            "SELECT document_name, full_document_text 
             FROM projects_activities WHERE id = ?1",
            params![document_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        )?;
        
        // Create a new association with the target project
        conn.execute(
            "INSERT INTO projects_activities (project_id, activity_id, document_name, full_document_text)
             VALUES (?1, ?2, ?3, ?4)",
            params![project_id, document_id, document_name, full_text],
        )?;
    }
    
    Ok(())
}

// New function to remove a project tag from a document
pub fn untag_document_from_project(
    conn: &Connection,
    document_id: i64,
    project_id: i64,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM projects_activities 
         WHERE id = ?1 AND project_id = ?2",
        params![document_id, project_id],
    )?;
    Ok(())
}

// Get all projects associated with a document
pub fn get_document_projects(
    conn: &Connection,
    document_id: i64,
) -> Result<Vec<i64>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT project_id FROM projects_activities 
         WHERE id = ?1"
    )?;
    
    let project_ids = stmt.query_map(params![document_id], |row| {
        row.get::<_, i64>(0)
    })?;
    
    let mut result = Vec::new();
    for id in project_ids {
        result.push(id?);
    }
    
    Ok(result)
}

pub fn add_project_activities(
    conn: &Connection,
    project_id: i64,
    activity_ids: &Vec<i64>,
) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare(
        "INSERT INTO projects_activities (project_id, activity_id, document_name, full_document_text)
         SELECT ?1, id, COALESCE(window_title, 'Document ' || id), edited_full_text
         FROM activity_full_text
         WHERE id = ?2"
    )?;

    for &activity_id in activity_ids {
        stmt.execute(params![project_id, activity_id])?;
    }
    Ok(())
}

pub fn fetch_all_projects(conn: &Connection) -> Result<Vec<Project>, rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT id, name, created_at FROM projects")?;
    let project_iter = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            activities: Vec::new(),
            activity_ids: Vec::new(),
            activity_names: Vec::new(),
            created_at: row.get(2)?,
        })
    })?;

    let mut projects = Vec::new();
    for project in project_iter {
        let mut project = project?;
        let (ids, activity_ids, names) = fetch_activities_by_project_id(conn, project.id)?;
        project.activities = ids;
        project.activity_ids = activity_ids;
        project.activity_names = names;
        projects.push(project);
    }

    Ok(projects)
}

pub fn fetch_activities_by_project_id(
    conn: &Connection,
    project_id: i64,
) -> Result<(Vec<i64>, Vec<Option<i64>>, Vec<String>), rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT pa.id, pa.activity_id, pa.document_name
         FROM projects_activities pa
         WHERE pa.project_id = ?1
         ORDER BY pa.id"
    )?;

    let rows = stmt.query_map(params![project_id], |row| {
        Ok((
            row.get::<_, i64>("id")?,
            row.get::<_, Option<i64>>("activity_id")?,
            row.get::<_, String>("document_name")?,
        ))
    })?;

    let mut ids = Vec::new();
    let mut activity_ids = Vec::new();
    let mut names = Vec::new();

    for row in rows {
        let (id, activity_id, name) = row?;
        ids.push(id);
        activity_ids.push(activity_id);
        names.push(name);
    }

    Ok((ids, activity_ids, names))
}

pub fn get_activity_text_from_project(
    conn: &Connection,
    activity_id: i64,
) -> Result<Option<(String, String)>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT document_name, full_document_text 
         FROM projects_activities 
         WHERE id = ?1"  // Only using the activity ID (document ID)
    )?;
    
    let result = stmt.query_row(params![activity_id], |row| {
        let document_name: String = row.get(0)?;
        let full_document_text: String = row.get(1)?;
        Ok((document_name, full_document_text))
    });

    match result {
        Ok((document_name, full_document_text)) => {
            Ok(Some((document_name, full_document_text)))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn update_activity_text(
    conn: &Connection,
    activity_id: i64,
    text: &str,
) -> Result<bool, rusqlite::Error> {
    // Update the document text
    conn.execute(
        "UPDATE projects_activities SET full_document_text = ?1 WHERE id = ?2",
        params![text, activity_id],
    )?;
    
    info!("Updated document text for ID: {}, length: {}", activity_id, text.len());

    // Simple check: needs vectorization if text > 200 chars and not already vectorized
    if text.len() > 200 {
        let is_vectorized: bool = conn.query_row(
            "SELECT is_vectorized FROM projects_activities WHERE id = ?1",
            params![activity_id],
            |row| Ok(row.get::<_, i64>(0)? != 0)
        )?;
        
        info!("Document ID: {} - Text length > 200, already vectorized: {}", activity_id, is_vectorized);
        
        // Return true if document needs vectorization
        return Ok(!is_vectorized);
    }
    
    info!("Document ID: {} text length too short for vectorization", activity_id);
    Ok(false)
}

/// Simple function to mark a document as vectorized
pub fn mark_document_as_vectorized(
    conn: &Connection,
    activity_id: i64,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE projects_activities SET is_vectorized = 1 WHERE id = ?1",
        params![activity_id],
    )?;
    info!("Marked document ID: {} as vectorized", activity_id);
    Ok(())
}

pub fn update_activity_name(
    conn: &Connection,
    activity_id: i64,
    name: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE projects_activities SET document_name = ?1 WHERE id = ?2",
        params![name, activity_id],
    )?;
    Ok(())
}

pub fn add_blank_document(
    conn: &Connection,
    project_id: i64,
) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT INTO projects_activities (project_id, document_name, full_document_text) 
         VALUES (?1, ?2, ?3)",
        params![project_id, "New Document", "Start editing"],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn delete_project_document(
    conn: &Connection,
    activity_id: i64,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM projects_activities WHERE id = ?1",
        params![activity_id],
    )?;
    Ok(())
}

const DEFAULT_PROJECT_ID: i64 = 0;

pub fn ensure_unassigned_project(conn: &Connection) -> Result<i64, rusqlite::Error> {
    // Check if unassigned project exists
    let mut stmt = conn.prepare("SELECT id FROM projects WHERE name = ?1")?;
    let mut rows = stmt.query_map(params!["Unassigned"], |row| row.get(0))?;
    
    if let Some(Ok(id)) = rows.next() {
      // Project exists, return its ID
      return Ok(id);
    }
    
    // Project doesn't exist, create it
    conn.execute(
      "INSERT INTO projects (name) VALUES (?1)",
      params!["Unassigned"],
    )?;
    
    Ok(conn.last_insert_rowid())
  }