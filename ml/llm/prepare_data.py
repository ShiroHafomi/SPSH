#!/usr/bin/env python3
"""
prepare_data.py — Generate instruction-tuning dataset for LLM fine-tuning.

Connects to MySQL, fetches student data, generates feedback from the rule-based
templates, and produces a JSONL file for fine-tuning with TRL/SFTTrainer.

Output: ml/llm/data/train.jsonl (Alpaca format)
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Add parent for schema_map access
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import pandas as pd
import pymysql

# Import the feedback generator (Node.js module; we replicate in Python below)
# For initial scaffolding, we use a simplified Python port of feedbackTemplates.js


def fetch_students():
    """Fetch all student rows from MySQL."""
    import dotenv
    dotenv.load_dotenv()

    conn = pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "student_performance"),
        charset="utf8mb4",
    )

    table = os.getenv("DB_TABLE", "students")
    df = pd.read_sql(f"SELECT * FROM `{table}`", conn)
    conn.close()
    return df


def generate_prompt(row, prediction):
    """Generate a natural-language instruction–response pair."""
    profile_parts = [
        f"Gender: {row.get('gender', 'unknown')}",
        f"Age: {row.get('age', 'unknown')}",
        f"Study Hours: {row.get('study_hours_per_day', 'N/A')}/day",
        f"Attendance: {row.get('attendance_percent', 'N/A')}%",
        f"Sleep: {row.get('sleep_hours', 'N/A')}h",
        f"GPA: {row.get('previous_gpa', 'N/A')}",
        f"Parental Education: {row.get('parental_education', 'unknown')}",
        f"Internet Access: {row.get('internet_access', 'unknown')}",
        f"Extracurricular: {row.get('extracurricular', 'unknown')}",
        f"Part-Time Job: {row.get('part_time_job', 'unknown')}",
    ]

    instruction = (
        "Analyze this student profile and provide personalized academic "
        "counseling with study recommendations:\n\n"
        + "\n".join(profile_parts)
    )

    response = f"Predicted Final Score: {prediction.get('final_score', 'N/A')}\n"
    response += f"Predicted Grade: {prediction.get('grade', 'N/A')}\n\n"

    feedback_recs = prediction.get("feedback", {}).get("recommendations", [])
    if feedback_recs:
        response += "Recommendations:\n"
        for rec in feedback_recs:
            response += f"- {rec['icon']} {rec['title']}: {rec['text']}\n"

    return {"instruction": instruction, "output": response}


def generate_dataset(df, output_path):
    """Generate instruction-tuning dataset from student data.

    For scaffolding, uses rule-based feedback templates directly (no ML call).
    When a genuine model is fine-tuned, replace with real inference calls.
    """
    # We don't have the ML inference module imported yet — scaffolding only
    # Import the node.js-style generator via a ported Python version
    # For now: emit a minimal dataset skeleton

    import json

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    records = []

    for _, row in df.iterrows():
        profile = row.to_dict()

        # Generate a simple feedback entry (placeholder for real inference)
        study_h = float(row.get("study_hours_per_day", 4))
        gpa = float(row.get("previous_gpa", 3.0))

        if study_h < 2:
            feedback = "Your study hours are critically low. Aim for 4+ hours daily for 10+ point improvement."
        elif study_h < 4:
            feedback = "Increase study hours to 4-5 per day for better retention. Try Pomodoro technique."
        elif gpa < 2.5:
            feedback = "Focus on core subjects — strong fundamentals raise all grades."
        else:
            feedback = "Your study habits are solid. Challenge yourself with advanced material."

        record = {
            "instruction": (
                f"Analyze this student profile:\n"
                f"- Gender: {row.get('gender', 'N/A')}\n"
                f"- Age: {row.get('age', 'N/A')}\n"
                f"- Study hours: {row.get('study_hours_per_day', 'N/A')}/day\n"
                f"- Attendance: {row.get('attendance_percent', 'N/A')}%\n"
                f"- Sleep: {row.get('sleep_hours', 'N/A')}h\n"
                f"- GPA: {row.get('previous_gpa', 'N/A')}\n"
                f"- Parental Edu: {row.get('parental_education', 'N/A')}\n\n"
                f"Provide study recommendations and a predicted grade."
            ),
            "output": (
                f"Predicted Grade: {'A' if gpa >= 3.5 else 'B' if gpa >= 3.0 else 'C' if gpa >= 2.0 else 'D'}\n\n"
                f"Recommendations:\n- {feedback}"
            ),
        }
        records.append(record)

    with open(output_path, "w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f" Wrote {len(records)} training examples to {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Prepare LLM fine-tuning dataset")
    parser.add_argument(
        "--output", default="data/train.jsonl", help="Path to output JSONL"
    )
    parser.add_argument(
        "--val-split", type=float, default=0.1,
        help="Fraction for validation (saved as val.jsonl)"
    )
    args = parser.parse_args()

    print(" Fetching students from MySQL...")
    df = fetch_students()
    print(f"   {len(df)} students loaded")

    base_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(base_dir, exist_ok=True)

    train_path = os.path.join(base_dir, "train.jsonl")
    val_path = os.path.join(base_dir, "val.jsonl")

    generate_dataset(df, train_path)

    # Simple dataset-level statistics
    with open(train_path, encoding="utf-8") as f:
        lines = f.readlines()

    print(f"\n Dataset statistics:")
    print(f"   Total examples: {len(lines)}")

    tok_estimate = sum(len(line.split()) for line in lines)
    print(f"   Estimated tokens: ~{tok_estimate:,} (characters) ")
    print(f"\n🔜 Next step: python train_lora.py")


if __name__ == "__main__":
    main()