"""Shared feature engineering for model training and inference."""


def create_interaction_features(df):
    """Return a copy with the interaction columns expected by trained models."""
    enhanced = df.copy()

    if "study_hours_per_day" in df.columns and "attendance_percent" in df.columns:
        enhanced["study_attendance_interaction"] = (
            df["study_hours_per_day"].clip(0, 16)
            * df["attendance_percent"]
            / 100.0
        )

    if "study_hours_per_day" in df.columns and "previous_gpa" in df.columns:
        enhanced["study_gpa_interaction"] = (
            df["study_hours_per_day"].clip(0, 16)
            * df["previous_gpa"].clip(0, 4)
        )

    if "sleep_hours" in df.columns and "attendance_percent" in df.columns:
        enhanced["sleep_attendance_interaction"] = (
            df["sleep_hours"].clip(0, 16)
            * df["attendance_percent"]
            / 100.0
        )

    if "attendance_percent" in df.columns and "previous_gpa" in df.columns:
        enhanced["attendance_gpa_interaction"] = (
            df["attendance_percent"]
            * df["previous_gpa"].clip(0, 3)
            / 100.0
        )

    return enhanced
