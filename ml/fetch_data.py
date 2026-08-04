#!/usr/bin/env python3
"""
Fetch student data from MySQL and cache as CSV.
Run: python ml/fetch_data.py
"""
import os
import sys
import pandas as pd
from sqlalchemy import create_engine
from pathlib import Path

# Add project root to path for config
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Database config - matches .env in project root
DB_URL = "mysql+pymysql://root:Phuoc123!@localhost:3306/student_performance"

TABLE = "students"
CACHE_PATH = PROJECT_ROOT / "ml" / "data" / "students.csv"


def fetch_from_mysql() -> pd.DataFrame:
    """Connect to MySQL and fetch all student records."""
    print(f"Connecting to MySQL...")
    engine = create_engine(DB_URL)
    try:
        query = f"SELECT * FROM `{TABLE}` ORDER BY `student_id`"
        print(f"Executing query: {query}")
        df = pd.read_sql(query, engine)
        print(f"Fetched {len(df)} rows, {len(df.columns)} columns")
        return df
    finally:
        engine.dispose()


def prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    """Drop non-predictive columns and return feature DataFrame."""
    # Columns to drop (not useful for prediction)
    drop_cols = ["id", "student_id", "notes"]
    df = df.drop(columns=[c for c in drop_cols if c in df.columns])
    print(f"Dropped non-predictive columns: {drop_cols}")
    print(f"Remaining columns: {list(df.columns)}")
    return df


def main():
    """Main entry point."""
    print("=" * 50)
    print("Fetching Student Performance Data from MySQL")
    print("=" * 50)

    # Ensure cache directory exists
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)

    try:
        df = fetch_from_mysql()
        df = prepare_features(df)

        # Save cache
        df.to_csv(CACHE_PATH, index=False)
        print(f"\n[OK] Data cached to: {CACHE_PATH}")
        print(f"  Shape: {df.shape}")
        print(f"  Columns: {list(df.columns)}")

        # Show sample
        print("\nFirst 3 rows:")
        print(df.head(3).to_string())

        # Show dtypes
        print("\nData types:")
        print(df.dtypes.to_string())

        # Show basic stats for numeric
        print("\nNumeric summary:")
        print(df.describe().to_string())

    except Exception as e:
        print(f"\n[ERROR] Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()