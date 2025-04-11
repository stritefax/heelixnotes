use std::path::Path;
use reqwest::{self, multipart};
use anyhow::{Result, anyhow};
use serde_json::{Value, json};
use log::info;

/// Transcribe audio using OpenAI's Whisper API
pub async fn transcribe_with_openai(file_path: &str, api_key: &str) -> Result<String> {
    info!("Transcribing with OpenAI Whisper API: {}", file_path);
    
    // Prepare file for upload
    let file_name = Path::new(file_path).file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("audio.wav");
    
    let form = multipart::Form::new()
        .part("file", multipart::Part::bytes(std::fs::read(file_path)?)
            .file_name(file_name.to_string())
            .mime_str("audio/wav")?)
        .text("model", "whisper-1")
        .text("response_format", "text");
    
    // Send request to OpenAI API
    let client = reqwest::Client::new();
    let response = client.post("https://api.openai.com/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await?;
    
    // Handle the response
    if response.status().is_success() {
        let text = response.text().await?;
        info!("Transcription successful, length: {}", text.len());
        Ok(text)
    } else {
        let error_text = response.text().await?;
        info!("Transcription failed: {}", error_text);
        Err(anyhow!("OpenAI API error: {}", error_text))
    }
}

/// Transcribe audio using Claude API (by encoding the audio and asking Claude to transcribe)
pub async fn transcribe_with_claude(file_path: &str, _api_key: &str) -> Result<String> {
    info!("Transcribing with Claude API: {}", file_path);
    
    // For Claude, we'll need to use OpenAI's Whisper API as a fallback
    // Since Claude doesn't directly support audio transcription through its API
    info!("Claude doesn't directly support audio transcription, using OpenAI Whisper as fallback");
    
    // Get the OpenAI API key
    match std::env::var("OPENAI_API_KEY").or_else(|_| std::env::var("HEELIX_OPENAI_API_KEY")) {
        Ok(openai_key) => {
            // Use OpenAI Whisper API for transcription if we have a key
            transcribe_with_openai(file_path, &openai_key).await
        },
        Err(_) => {
            // If no OpenAI key is available, return an informative error
            Err(anyhow!("Audio transcription requires an OpenAI API key. Claude doesn't support direct audio transcription."))
        }
    }
} 