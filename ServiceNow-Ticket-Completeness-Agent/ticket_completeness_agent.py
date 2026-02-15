#!/usr/bin/env python3
"""
Alternative approach: Create a custom Azure OpenAI client that works with the exact endpoint.
This makes direct HTTP requests.
"""

import csv
import json
import os
from typing import Any, Dict, List
import httpx
import asyncio
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Copy the tool functions from the original script
def read_ticket_json(path: str) -> str:
    """Read a local JSON file containing ServiceNow tickets."""
    if not os.path.exists(path):
        raise FileNotFoundError(f"Ticket file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def read_rules_csv(path: str) -> List[str]:
    """Read a CSV rules file (one rule per line, first column)."""
    if not os.path.exists(path):
        raise FileNotFoundError(f"Rules file not found: {path}")
    rules: List[str] = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if row and row[0].strip():
                rules.append(row[0].strip())
    return rules

def write_reports(report: List[Dict[str, Any]], json_path: str, csv_path: str) -> str:
    """Persist analysis results to disk as both JSON and CSV."""
    # JSON
    with open(json_path, "w", encoding="utf-8") as jf:
        json.dump(report, jf, ensure_ascii=False, indent=2)

    # CSV
    fieldnames = [
        "ticket_id", "ticket_number", "type", "completeness", 
        "missing_fields", "remarks",
    ]
    with open(csv_path, "w", newline="", encoding="utf-8") as cf:
        writer = csv.DictWriter(cf, fieldnames=fieldnames)
        writer.writeheader()
        for item in report:
            writer.writerow({
                "ticket_id": item.get("ticket_id", "unknown"),
                "ticket_number": item.get("ticket_number", ""),
                "type": item.get("type", ""),
                "completeness": item.get("completeness", False),
                "missing_fields": ", ".join(item.get("missing_fields", [])),
                "remarks": item.get("remarks", ""),
            })
    return f"Reports written. JSON: {json_path}  CSV: {csv_path}"

class AzureOpenAIClient:
    """Direct client for Azure OpenAI API using the working endpoint configuration."""

    def __init__(self):
        self.api_key = os.getenv("AZURE_OPENAI_API_KEY")
        self.api_version = os.getenv("AZURE_OPENAI_API_VERSION")
        self.url = os.getenv("AZURE_OPENAI_URL")
        self.model = os.getenv("AZURE_OPENAI_MODEL", "gpt-4.1")
        if not self.api_key or not self.api_version or not self.url or not self.model:
            raise RuntimeError("Missing required environment variables: AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_VERSION, AZURE_OPENAI_URL, AZURE_OPENAI_MODEL")
        self.headers = {
            "api-key": self.api_key,
            "Content-Type": "application/json"
        }
        self.params = {"api-version": self.api_version}
    
    async def chat_completion(self, messages: List[Dict[str, str]], max_tokens: int = 8000) -> str:
        """Make a chat completion request to the OpenAI-compatible API."""
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0.2
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                self.url,
                json=payload,
                headers=self.headers,
                params=self.params
            )
            if response.status_code == 200:
                result = response.json()
                return result["choices"][0]["message"]["content"]
            else:
                raise Exception(f"API request failed: {response.status_code} - {response.text}")

async def analyze_tickets_direct():
    """Analyze tickets using direct Azure OpenAI client"""

    # File paths
    ticket_path = "./data/servicenow_tickets.json"
    rules_path = "./data/completeness_rules.csv"
    out_json = "ticket_completeness_report.json"
    out_csv = "ticket_completeness_report.csv"
    
    print("Loading data files...")
    
    # Load inputs
    tickets_raw = read_ticket_json(ticket_path)
    rules = read_rules_csv(rules_path)
    
    print(f"Loaded {len(rules)} rules")
    
    # Create AI client
    client = AzureOpenAIClient()
    
    # Create the analysis prompt
    system_prompt = """You are a meticulous ITSM validator for ServiceNow tickets. 
Analyze the provided tickets against the completeness rules and return a JSON array with this exact structure:

[
  {
    "ticket_id": "string (prefer sys_id, else number, else 'unknown')",
    "ticket_number": "string (prefer number field, else '')",
    "type": "string (incident/request/other)",
    "completeness": boolean,
    "missing_fields": ["field1", "field2"],
    "remarks": "string (concise guidance)"
  }
]

Rules to apply:
""" + "\n".join([f"- {rule}" for rule in rules])

    user_prompt = f"""Analyze these ServiceNow tickets for completeness:

{tickets_raw}

Return ONLY the JSON array, no other text or markdown."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    print("Sending request to Azure OpenAI...")
    
    try:
        # Make the API call
        response = await client.chat_completion(messages, max_tokens=8000)

        print("Got response from Azure OpenAI!")

        # Parse the JSON response
        try:
            # Clean up the response (remove any markdown formatting)
            clean_response = response.strip()
            if clean_response.startswith('```json'):
                clean_response = clean_response.split('```json')[1].split('```')[0].strip()
            elif clean_response.startswith('```'):
                clean_response = clean_response.split('```')[1].split('```')[0].strip()
            
            report = json.loads(clean_response)
            
            # Write reports
            result_msg = write_reports(report, out_json, out_csv)
            print(result_msg)
            
            print(f"\n✅ Analysis complete! Analyzed {len(report)} tickets.")
            print(f"📄 JSON report: {out_json}")
            print(f"📊 CSV report: {out_csv}")
            
            return report
            
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse AI response as JSON: {e}")
            print(f"Raw response: {response[:500]}...")
            return None
            
    except Exception as e:
        print(f"❌ Error during Azure OpenAI request: {e}")
        return None

if __name__ == "__main__":
    print("🚀 Starting direct Azure OpenAI analysis...")
    result = asyncio.run(analyze_tickets_direct())
    if result:
        print("🎉 Analysis completed successfully!")
    else:
        print("❌ Analysis failed.")
