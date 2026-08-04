#!/usr/bin/env python3
"""
Train ML models for student performance prediction.
Run: python ml/train.py
"""
import sys
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import (
    cross_val_score, RepeatedKFold, train_test_split, GridSearchCV
)
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.ensemble import GradientBoostingRegressor, GradientBoostingClassifier
from sklearn.linear_model import RidgeCV, LogisticRegressionCV
from sklearn.metrics import (
    mean_squared_error, mean_absolute_error, r2_score,
    accuracy_score, f1_score, confusion_matrix, classification_report
)
from sklearn.inspection import permutation_importance

# Suppress warnings for cleaner output
warnings.filterwarnings('ignore')

PROJECT_ROOT = Path(__file__).parent.parent
DATA_PATH = PROJECT_ROOT / "ml" / "data" / "students.csv"
MODELS_DIR = PROJECT_ROOT / "ml" / "models"
OUTPUT_DIR = PROJECT_ROOT / "ml" / "output"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Column definitions (matching fetch_data.py output)
DROP_COLS = ['created_at', 'updated_at']
TARGET_REG = 'final_score'
TARGET_CLF = 'grade'

# Grade mapping for ordinal classification
GRADE_MAP = {'F': 0, 'D': 1, 'C': 2, 'B': 3, 'A': 4}
GRADE_REV = {v: k for k, v in GRADE_MAP.items()}


def load_data():
    """Load and prepare data from cached CSV."""
    print("Loading data...")
    df = pd.read_csv(DATA_PATH)

    # Drop timestamp columns
    df = df.drop(columns=[c for c in DROP_COLS if c in df.columns])

    print(f"Data shape: {df.shape}")
    print(f"Columns: {list(df.columns)}")
    return df


def get_feature_types(df):
    """Identify feature column types for preprocessing."""
    numeric_features = ['age', 'study_hours_per_day', 'attendance_percent',
                        'sleep_hours', 'previous_gpa']
    categorical_features = ['gender', 'parental_education']
    binary_features = ['internet_access', 'extracurricular', 'part_time_job']

    # Only keep features that exist in the dataframe
    numeric_features = [c for c in numeric_features if c in df.columns]
    categorical_features = [c for c in categorical_features if c in df.columns]
    binary_features = [c for c in binary_features if c in df.columns]

    return numeric_features, categorical_features, binary_features


def build_preprocessor(numeric_features, categorical_features, binary_features):
    """Build ColumnTransformer for feature preprocessing."""
    transformers = []

    if numeric_features:
        transformers.append((
            'num', StandardScaler(), numeric_features
        ))

    if categorical_features:
        transformers.append((
            'cat', OneHotEncoder(drop='first', sparse_output=False, handle_unknown='ignore'),
            categorical_features
        ))

    # Binary features pass through unchanged (already 0/1)
    if binary_features:
        transformers.append((
            'bin', 'passthrough', binary_features
        ))

    return ColumnTransformer(transformers, remainder='drop')


def evaluate_regression(model, X, y, cv):
    """Evaluate regression model with cross-validation."""
    scores = {
        'r2': cross_val_score(model, X, y, cv=cv, scoring='r2', n_jobs=-1),
        'neg_mae': cross_val_score(model, X, y, cv=cv, scoring='neg_mean_absolute_error', n_jobs=-1),
        'neg_rmse': cross_val_score(model, X, y, cv=cv, scoring='neg_root_mean_squared_error', n_jobs=-1),
    }
    return {
        'r2_mean': float(scores['r2'].mean()),
        'r2_std': float(scores['r2'].std()),
        'mae_mean': float(-scores['neg_mae'].mean()),
        'mae_std': float(scores['neg_mae'].std()),
        'rmse_mean': float(-scores['neg_rmse'].mean()),
        'rmse_std': float(scores['neg_rmse'].std()),
    }


def evaluate_classification(model, X, y, cv):
    """Evaluate classification model with cross-validation."""
    scores = {
        'accuracy': cross_val_score(model, X, y, cv=cv, scoring='accuracy', n_jobs=-1),
        'f1_weighted': cross_val_score(model, X, y, cv=cv, scoring='f1_weighted', n_jobs=-1),
    }
    return {
        'accuracy_mean': float(scores['accuracy'].mean()),
        'accuracy_std': float(scores['accuracy'].std()),
        'f1_mean': float(scores['f1_weighted'].mean()),
        'f1_std': float(scores['f1_weighted'].std()),
    }


def train_regression_models(X, y, cv):
    """Train and compare regression models."""
    print("\n" + "="*60)
    print("REGRESSION: Predicting Final_Score")
    print("="*60)

    models = {
        'RandomForest': RandomForestRegressor(
            n_estimators=200, max_depth=5, min_samples_split=5,
            min_samples_leaf=2, random_state=42, n_jobs=-1
        ),
        'GradientBoosting': GradientBoostingRegressor(
            n_estimators=200, max_depth=4, learning_rate=0.05,
            min_samples_split=5, min_samples_leaf=2, random_state=42
        ),
        'RidgeCV': RidgeCV(alphas=[0.1, 1.0, 10.0, 100.0], cv=5),
    }

    results = {}
    best_model = None
    best_score = -np.inf

    for name, model in models.items():
        print(f"\nTraining {name}...")
        metrics = evaluate_regression(model, X, y, cv)
        results[name] = metrics

        print(f"  R²:    {metrics['r2_mean']:.4f} (±{metrics['r2_std']:.4f})")
        print(f"  MAE:   {metrics['mae_mean']:.4f} (±{metrics['mae_std']:.4f})")
        print(f"  RMSE:  {metrics['rmse_mean']:.4f} (±{metrics['rmse_std']:.4f})")

        if metrics['r2_mean'] > best_score:
            best_score = metrics['r2_mean']
            best_model = (name, model)

    print(f"\nBest regression model: {best_model[0]} (R² = {best_score:.4f})")
    return best_model, results


def train_classification_models(X, y, cv):
    """Train and compare classification models."""
    print("\n" + "="*60)
    print("CLASSIFICATION: Predicting Grade")
    print("="*60)

    models = {
        'RandomForest': RandomForestClassifier(
            n_estimators=200, max_depth=5, min_samples_split=5,
            min_samples_leaf=2, random_state=42, n_jobs=-1
        ),
        'GradientBoosting': GradientBoostingClassifier(
            n_estimators=200, max_depth=4, learning_rate=0.05,
            min_samples_split=5, min_samples_leaf=2, random_state=42
        ),
        'LogisticRegressionCV': LogisticRegressionCV(
            Cs=[0.1, 1.0, 10.0], cv=5, max_iter=1000, random_state=42, n_jobs=-1
        ),
    }

    results = {}
    best_model = None
    best_score = -np.inf

    for name, model in models.items():
        print(f"\nTraining {name}...")
        metrics = evaluate_classification(model, X, y, cv)
        results[name] = metrics

        print(f"  Accuracy: {metrics['accuracy_mean']:.4f} (±{metrics['accuracy_std']:.4f})")
        print(f"  F1:       {metrics['f1_mean']:.4f} (±{metrics['f1_std']:.4f})")

        if metrics['accuracy_mean'] > best_score:
            best_score = metrics['accuracy_mean']
            best_model = (name, model)

    print(f"\nBest classification model: {best_model[0]} (Accuracy = {best_score:.4f})")
    return best_model, results


def plot_feature_importance(model, preprocessor, feature_names, output_path):
    """Plot and save feature importance."""
    # Get feature names after one-hot encoding
    try:
        cat_encoder = preprocessor.named_transformers_['cat']
        cat_features = cat_encoder.get_feature_names_out()
        all_features = np.concatenate([
            feature_names[0],  # numeric
            cat_features,
            feature_names[2]   # binary
        ])
    except:
        all_features = feature_names

    # Get importances
    if hasattr(model, 'feature_importances_'):
        importances = model.feature_importances_
    elif hasattr(model, 'coef_'):
        importances = np.abs(model.coef_).flatten()
    else:
        # Use permutation importance
        print("Computing permutation importance...")
        return

    # Create importance dataframe
    imp_df = pd.DataFrame({'feature': all_features, 'importance': importances})
    imp_df = imp_df.sort_values('importance', ascending=True).tail(15)

    # Plot
    plt.figure(figsize=(10, 8))
    plt.barh(range(len(imp_df)), imp_df['importance'])
    plt.yticks(range(len(imp_df)), imp_df['feature'])
    plt.xlabel('Importance')
    plt.title('Feature Importance (Top 15)')
    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.close()
    print(f"Feature importance plot saved to {output_path}")


def plot_predictions_vs_actual(model, X, y, output_path, target_name):
    """Plot predictions vs actual values."""
    preds = model.predict(X)

    plt.figure(figsize=(8, 8))
    plt.scatter(y, preds, alpha=0.6)
    plt.plot([y.min(), y.max()], [y.min(), y.max()], 'r--', lw=2)
    plt.xlabel('Actual')
    plt.ylabel('Predicted')
    plt.title(f'{target_name}: Predicted vs Actual')
    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.close()
    print(f"Predictions vs Actual plot saved to {output_path}")


def plot_confusion_matrix(model, X, y, output_path):
    """Plot confusion matrix for classification."""
    preds = model.predict(X)
    cm = confusion_matrix(y, preds)

    plt.figure(figsize=(8, 6))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                xticklabels=sorted(GRADE_MAP.keys()),
                yticklabels=sorted(GRADE_MAP.keys()))
    plt.xlabel('Predicted')
    plt.ylabel('Actual')
    plt.title('Confusion Matrix')
    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.close()
    print(f"Confusion matrix saved to {output_path}")


def main():
    print("="*60)
    print("Student Performance Model Training")
    print("="*60)

    # Load data
    df = load_data()

    # Get feature types
    numeric_features, categorical_features, binary_features = get_feature_types(df)
    feature_names = (numeric_features, categorical_features, binary_features)

    print(f"\nNumeric features: {numeric_features}")
    print(f"Categorical features: {categorical_features}")
    print(f"Binary features: {binary_features}")

    # Build preprocessor
    preprocessor = build_preprocessor(numeric_features, categorical_features, binary_features)

    # Prepare X and y
    X = df.drop(columns=[TARGET_REG, TARGET_CLF])
    y_reg = df[TARGET_REG].values
    y_clf = df[TARGET_CLF].map(GRADE_MAP).values

    # Fit preprocessor
    X_transformed = preprocessor.fit_transform(X)
    print(f"\nTransformed feature shape: {X_transformed.shape}")

    # Cross-validation strategy for small data
    cv = RepeatedKFold(n_splits=5, n_repeats=3, random_state=42)

    # Train regression models
    (best_reg_name, best_reg_model), reg_results = train_regression_models(
        X_transformed, y_reg, cv
    )

    # Train classification models
    (best_clf_name, best_clf_model), clf_results = train_classification_models(
        X_transformed, y_clf, cv
    )

    # Fit best models on full data
    print("\nFitting best models on full dataset...")
    best_reg_model.fit(X_transformed, y_reg)
    best_clf_model.fit(X_transformed, y_clf)

    # Save models and preprocessor
    print("\nSaving models...")
    joblib.dump(best_reg_model, MODELS_DIR / "regressor.joblib")
    joblib.dump(best_clf_model, MODELS_DIR / "classifier.joblib")
    joblib.dump(preprocessor, MODELS_DIR / "preprocessor.joblib")

    # Save metrics
    metrics = {
        'regression': {
            'best_model': best_reg_name,
            'cv_results': reg_results,
        },
        'classification': {
            'best_model': best_clf_name,
            'cv_results': clf_results,
            'grade_map': GRADE_MAP,
        },
        'feature_info': {
            'numeric_features': numeric_features,
            'categorical_features': categorical_features,
            'binary_features': binary_features,
        }
    }
    with open(MODELS_DIR / "metrics.json", 'w') as f:
        json.dump(metrics, f, indent=2)

    # Generate plots
    print("\nGenerating plots...")
    plot_feature_importance(
        best_reg_model, preprocessor, feature_names,
        OUTPUT_DIR / "feature_importance_regression.png"
    )
    plot_feature_importance(
        best_clf_model, preprocessor, feature_names,
        OUTPUT_DIR / "feature_importance_classification.png"
    )
    plot_predictions_vs_actual(
        best_reg_model, X_transformed, y_reg,
        OUTPUT_DIR / "predictions_vs_actual_regression.png",
        "Final Score"
    )
    plot_confusion_matrix(
        best_clf_model, X_transformed, y_clf,
        OUTPUT_DIR / "confusion_matrix.png"
    )

    print("\n" + "="*60)
    print("TRAINING COMPLETE")
    print("="*60)
    print(f"Models saved to: {MODELS_DIR}")
    print(f"Plots saved to: {OUTPUT_DIR}")
    print(f"Best regression: {best_reg_name} (R² = {reg_results[best_reg_name]['r2_mean']:.4f})")
    print(f"Best classification: {best_clf_name} (Acc = {clf_results[best_clf_name]['accuracy_mean']:.4f})")


if __name__ == "__main__":
    main()