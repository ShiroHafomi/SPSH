#!/usr/bin/env python3
"""
Inference CLI for student performance prediction.
Run: python ml/inference.py --help
"""
import sys
import json
import argparse
from pathlib import Path

import numpy as np
import pandas as pd
import joblib

PROJECT_ROOT = Path(__file__).parent.parent
MODELS_DIR = PROJECT_ROOT / "ml" / "models"

# Grade mapping (must match training)
GRADE_MAP = {'F': 0, 'D': 1, 'C': 2, 'B': 3, 'A': 4}
GRADE_REV = {v: k for k, v in GRADE_MAP.items()}


def load_models():
    """Load trained models and preprocessor."""
    regressor = joblib.load(MODELS_DIR / "regressor.joblib")
    classifier = joblib.load(MODELS_DIR / "classifier.joblib")
    preprocessor = joblib.load(MODELS_DIR / "preprocessor.joblib")

    with open(MODELS_DIR / "metrics.json") as f:
        metrics = json.load(f)

    return regressor, classifier, preprocessor, metrics


def build_input_dataframe(args):
    """Build input DataFrame from parsed arguments."""
    # Default values (approximate dataset means)
    defaults = {
        'gender': 'Male',
        'age': 18,
        'study_hours_per_day': 3.2,
        'attendance_percent': 84,
        'sleep_hours': 7.1,
        'previous_gpa': 3.1,
        'parental_education': 'Bachelor',
        'internet_access': 1,
        'extracurricular': 1,
        'part_time_job': 0,
    }

    # Override with provided args
    for key in defaults:
        val = getattr(args, key.replace('-', '_'))
        if val is not None:
            # Convert Yes/No to 1/0 for binary features
            if key in ['internet_access', 'extracurricular', 'part_time_job']:
                val = 1 if str(val).lower() in ('yes', 'true', '1', 'y') else 0
            defaults[key] = val

    # Create DataFrame
    df = pd.DataFrame([defaults])

    # Ensure correct types
    df['age'] = df['age'].astype(int)
    df['attendance_percent'] = df['attendance_percent'].astype(int)
    df['internet_access'] = df['internet_access'].astype(int)
    df['extracurricular'] = df['extracurricular'].astype(int)
    df['part_time_job'] = df['part_time_job'].astype(int)

    return df


def predict(regressor, classifier, preprocessor, X):
    """Make predictions."""
    X_transformed = preprocessor.transform(X)

    # Regression prediction
    score_pred = regressor.predict(X_transformed)[0]

    # Classification prediction
    grade_pred_idx = classifier.predict(X_transformed)[0]
    grade_pred = GRADE_REV.get(grade_pred_idx, 'C')

    # Get class probabilities for confidence
    if hasattr(classifier, 'predict_proba'):
        probs = classifier.predict_proba(X_transformed)[0]
        confidence = float(probs.max())
        prob_dict = {GRADE_REV[i]: float(p) for i, p in enumerate(probs) if i in GRADE_REV}
    else:
        confidence = 1.0
        prob_dict = {}

    return {
        'final_score': float(score_pred),
        'grade': grade_pred,
        'grade_confidence': confidence,
        'grade_probabilities': prob_dict,
    }


def run_what_if(regressor, classifier, preprocessor, base_df, feature, new_value):
    """Run what-if scenario."""
    df = base_df.copy()
    df[feature] = new_value
    return predict(regressor, classifier, preprocessor, df)


def main():
    parser = argparse.ArgumentParser(
        description="Predict student final score and grade from study habits",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic prediction with defaults
  python ml/inference.py

  # Custom student profile
  python ml/inference.py --gender Female --age 19 --study-hours 4.5 \\
    --attendance 95 --sleep 8 --gpa 3.8 --parental PhD \\
    --internet-access Yes --extracurricular Yes --part-time-job No

  # From JSON file
  python ml/inference.py --json student.json

  # What-if analysis
  python ml/inference.py --what-if study_hours_per_day 5.0
        """
    )

    # Input mode
    input_group = parser.add_mutually_exclusive_group()
    input_group.add_argument('--json', type=str, help='Path to JSON file with student data')
    input_group.add_argument('--what-if', nargs=2, metavar=('FEATURE', 'VALUE'),
                             help='Run what-if: change FEATURE to VALUE')

    # Feature arguments
    parser.add_argument('--gender', choices=['Male', 'Female'], help='Gender')
    parser.add_argument('--age', type=int, choices=range(16, 26), help='Age (16-25)')
    parser.add_argument('--study-hours', dest='study_hours_per_day', type=float, help='Study hours per day')
    parser.add_argument('--attendance', dest='attendance_percent', type=int, help='Attendance percentage')
    parser.add_argument('--sleep', dest='sleep_hours', type=float, help='Sleep hours per night')
    parser.add_argument('--gpa', dest='previous_gpa', type=float, help='Previous GPA')
    parser.add_argument('--parental', dest='parental_education',
                        choices=['High School', 'Bachelor', 'Master', 'PhD'], help='Parental education level')
    parser.add_argument('--internet-access', dest='internet_access',
                        choices=['Yes', 'No'], help='Internet access')
    parser.add_argument('--extracurricular', choices=['Yes', 'No'], help='Extracurricular activities')
    parser.add_argument('--part-time-job', dest='part_time_job', choices=['Yes', 'No'], help='Part-time job')
    parser.add_argument('--api', action='store_true', help='Output JSON only (for API integration)')

    args = parser.parse_args()

    # Load models
    try:
        regressor, classifier, preprocessor, metrics = load_models()
    except FileNotFoundError as e:
        print(f"Error: Model files not found. Run 'python ml/train.py' first.")
        print(f"Details: {e}")
        sys.exit(1)

    # Build input
    if args.json:
        if args.json == '-':
            # Read from stdin
            import sys
            data = json.load(sys.stdin)
        else:
            with open(args.json) as f:
                data = json.load(f)
        # Convert Yes/No to 1/0
        for key in ['internet_access', 'extracurricular', 'part_time_job']:
            if key in data and isinstance(data[key], str):
                data[key] = 1 if data[key].lower() in ('yes', 'true', '1', 'y') else 0
        X = pd.DataFrame([data])
    else:
        X = build_input_dataframe(args)

    # Make prediction
    result = predict(regressor, classifier, preprocessor, X)

    # Output
    if args.api or args.json == '-':
        # JSON output for API
        print(json.dumps(result))
    else:
        # Human-readable output
        print("\n" + "="*50)
        print("PREDICTION RESULT")
        print("="*50)
        print(f"Predicted Final Score: {result['final_score']:.1f}")
        print(f"Predicted Grade:       {result['grade']} (confidence: {result['grade_confidence']:.1%})")

        if result['grade_probabilities']:
            print("\nGrade Probabilities:")
            for grade, prob in sorted(result['grade_probabilities'].items(), key=lambda x: -x[1]):
                print(f"  {grade}: {prob:.1%}")

        # What-if analysis
        if args.what_if:
            feature, value = args.what_if
            print(f"\n--- WHAT-IF: {feature} = {value} ---")
            try:
                if feature in ['internet_access', 'extracurricular', 'part_time_job']:
                    value = 1 if str(value).lower() in ('yes', 'true', '1', 'y') else 0
                elif feature in ['age', 'attendance_percent']:
                    value = int(value)
                else:
                    value = float(value)

                whatif_result = run_what_if(regressor, classifier, preprocessor, X, feature, value)
                score_diff = whatif_result['final_score'] - result['final_score']
                print(f"Predicted Final Score: {whatif_result['final_score']:.1f} ({score_diff:+.1f})")
                print(f"Predicted Grade:       {whatif_result['grade']}")
            except Exception as e:
                print(f"Error in what-if: {e}")

        # Show model info
        print("\n--- Model Info ---")
        print(f"Regression model: {metrics['regression']['best_model']} (CV R² = {metrics['regression']['cv_results'][metrics['regression']['best_model']]['r2_mean']:.4f})")
        print(f"Classification model: {metrics['classification']['best_model']} (CV Acc = {metrics['classification']['cv_results'][metrics['classification']['best_model']]['accuracy_mean']:.4f})")


if __name__ == "__main__":
    main()