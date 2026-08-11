#!/usr/bin/env python3
"""
prepare_data.py — Generate instruction-tuning dataset for LLM fine-tuning.

Connects to MySQL, fetches student data, generates feedback from the rule-based
templates, and produces a JSONL file for fine-tuning with TRL/SFTTrainer.

Outputs: ml/llm/data/train.jsonl + val.jsonl (Alpaca format)
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
    prediction = prediction or {}
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

    feedback_recs = (prediction.get("feedback") or {}).get("recommendations", [])
    if feedback_recs:
        response += "Recommendations:\n"
        for rec in feedback_recs:
            response += f"- {rec['icon']} {rec['title']}: {rec['text']}\n"

    return {"instruction": instruction, "output": response}


def _coerce_float(value, default):
    try:
        if value is None or pd.isna(value):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def generate_dataset(df, output_path):
    """Generate instruction-tuning dataset from student data.

    For scaffolding, uses rule-based feedback templates directly (no ML call).
    When a genuine model is fine-tuned, replace with real inference calls.
    """
    # We don't have the ML inference module imported yet — scaffolding only
    # Import the node.js-style generator via a ported Python version
    # For now: emit a minimal dataset skeleton

    import json

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    records = []

    for _, row in df.iterrows():
        # Generate a heuristic prediction payload (placeholder for real inference)
        study_h = _coerce_float(row.get("study_hours_per_day"), 4.0)
        gpa = _coerce_float(row.get("previous_gpa"), 3.0)

        if study_h < 2:
            feedback = "Your study hours are critically low. Aim for 4+ hours daily for 10+ point improvement."
        elif study_h < 4:
            feedback = "Increase study hours to 4-5 per day for better retention. Try Pomodoro technique."
        elif gpa < 2.0:
            feedback = "Your overall performance is in the F range. Start with tutoring, weekly planning, and attendance recovery."
        elif gpa < 2.5:
            feedback = "Focus on core subjects — strong fundamentals raise all grades."
        else:
            feedback = "Your study habits are solid. Challenge yourself with advanced material."

        attendance = _coerce_float(row.get("attendance_percent"), 80.0)
        sleep = _coerce_float(row.get("sleep_hours"), 7.0)

        final_score = int(
            round(
                max(
                    0.0,
                    min(
                        100.0,
                        (gpa * 16.0)
                        + (study_h * 4.0)
                        + (attendance * 0.2)
                        + (sleep * 1.5)
                        - 12.0,
                    ),
                )
            )
        )
        grade = (
            "A"
            if final_score >= 85
            else "B"
            if final_score >= 75
            else "C"
            if final_score >= 65
            else "D"
            if final_score >= 50
            else "F"
        )

        recommendations = [
            {"icon": "📘", "title": "Study Plan", "text": feedback},
        ]
        if attendance < 85:
            recommendations.append(
                {
                    "icon": "🕒",
                    "title": "Attendance",
                    "text": "Raise attendance above 90% to improve consistency and recall.",
                }
            )
        if sleep < 7:
            recommendations.append(
                {
                    "icon": "😴",
                    "title": "Sleep",
                    "text": "Aim for 7-8 hours of sleep to improve focus and retention.",
                }
            )
        if gpa < 2.5:
            recommendations.append(
                {
                    "icon": "🧠",
                    "title": "Tutoring",
                    "text": "Review core concepts weekly and ask for tutoring on difficult topics.",
                }
            )

        prediction = {
            "final_score": final_score,
            "grade": grade,
            "feedback": {"recommendations": recommendations},
        }
        record = generate_prompt(row, prediction)
        records.append(record)

    with open(output_path, "w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f" Wrote {len(records)} examples to {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Prepare LLM fine-tuning dataset")
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parent / "data" / "train.jsonl"),
        help="Path to training JSONL (validation is saved alongside it as val.jsonl)",
    )
    parser.add_argument(
        "--val-split",
        type=float,
        default=0.1,
        help="Fraction of rows reserved for validation",
    )
    args = parser.parse_args()

    print(" Fetching students from MySQL...")
    df = fetch_students()
    print(f"   {len(df)} students loaded")

    if not 0 < args.val_split < 1:
        print(" --val-split must be between 0 and 1")
        sys.exit(1)

    train_path = Path(args.output).expanduser()
    if not train_path.is_absolute():
        train_path = (Path(__file__).resolve().parent / train_path).resolve()

    base_dir = train_path.parent
    val_path = base_dir / "val.jsonl"
    os.makedirs(base_dir, exist_ok=True)

    if len(df) < 2:
        print("❌ Need at least 2 student rows to create a validation split.")
        sys.exit(1)

    shuffled = df.sample(frac=1, random_state=42).reset_index(drop=True)
    val_size = int(round(len(shuffled) * args.val_split))
    val_size = max(1, min(val_size, len(shuffled) - 1))

    train_df = shuffled.iloc[:-val_size].reset_index(drop=True)
    val_df = shuffled.iloc[-val_size:].reset_index(drop=True)

    generate_dataset(train_df, train_path)
    generate_dataset(val_df, val_path)

    print(f"\n Dataset statistics:")
    print(f"   Train examples: {len(train_df)}")
    print(f"   Validation examples: {len(val_df)}")
    print(f"   Train file: {train_path}")
    print(f"   Val file:   {val_path}")
    print(f"\n🔜 Next step: python train_lora.py")


if __name__ == "__main__":
    main()