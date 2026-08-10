#!/usr/bin/env python3
"""
Train ML models for student performance prediction with structured logging.
Run: python ml/train.py
"""

import sys
import json
import warnings
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Tuple, List, Optional

import numpy as np
import pandas as pd
import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import (
    cross_val_score,
    RepeatedKFold,
    train_test_split,
    GridSearchCV,
    cross_validate,
    StratifiedKFold,
)
from sklearn.preprocessing import StandardScaler, OneHotEncoder, PolynomialFeatures
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.ensemble import GradientBoostingRegressor, GradientBoostingClassifier
from sklearn.ensemble import (
    StackingRegressor,
    StackingClassifier,
    VotingRegressor,
    VotingClassifier,
)
from sklearn.linear_model import RidgeCV, LogisticRegressionCV
from sklearn.metrics import (
    mean_squared_error,
    mean_absolute_error,
    r2_score,
    accuracy_score,
    f1_score,
    confusion_matrix,
    classification_report,
    make_scorer,
)
from sklearn.inspection import permutation_importance
from sklearn.base import clone

# Optional imports with graceful fallback
try:
    import xgboost as xgb

    HAS_XGB = True
except ImportError:
    HAS_XGB = False

try:
    import catboost as cb

    HAS_CAT = True
except ImportError:
    HAS_CAT = False

try:
    import optuna

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    HAS_OPTUNA = True
except ImportError:
    HAS_OPTUNA = False

try:
    import shap

    HAS_SHAP = True
except ImportError:
    HAS_SHAP = False

# Suppress warnings for cleaner output
warnings.filterwarnings("ignore")

# ============================================================
# CONFIGURATION & PATHS
# ============================================================
PROJECT_ROOT = Path(__file__).parent.parent
DATA_PATH = PROJECT_ROOT / "ml" / "data" / "students.csv"
MODELS_DIR = PROJECT_ROOT / "ml" / "models"
OUTPUT_DIR = PROJECT_ROOT / "ml" / "output"
LOGS_DIR = PROJECT_ROOT / "ml" / "logs"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# Column definitions
DROP_COLS = ["created_at", "updated_at"]
TARGET_REG = "final_score"
TARGET_CLF = "grade"

# Grade mapping
GRADE_MAP = {"F": 0, "D": 1, "C": 2, "B": 3, "A": 4}
GRADE_REV = {v: k for k, v in GRADE_MAP.items()}


# ============================================================
# LOGGING SETUP
# ============================================================
def setup_logging() -> Tuple[logging.Logger, Path]:
    """Setup structured logging to file and console."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = LOGS_DIR / f"train_{timestamp}.log"

    # Create logger
    logger = logging.getLogger("train")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()

    # File handler (detailed)
    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh_formatter = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    fh.setFormatter(fh_formatter)

    # Console handler (summary)
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch_formatter = logging.Formatter("%(message)s")
    ch.setFormatter(ch_formatter)

    logger.addHandler(fh)
    logger.addHandler(ch)

    return logger, log_file


# Global logger (initialized in main)
logger = None
log_file_path = None


def log_section(title: str):
    """Log a section header."""
    logger.info("\n" + "=" * 60)
    logger.info(title)
    logger.info("=" * 60)


def log_subsection(title: str):
    """Log a subsection header."""
    logger.info(f"\n--- {title} ---")


def log_metrics(prefix: str, metrics: Dict[str, float]):
    """Log metrics in a structured way."""
    for key, value in metrics.items():
        logger.info(f"  {prefix}{key}: {value:.6f}")


# ============================================================
# DATA LOADING & PREPROCESSING
# ============================================================
def load_data() -> pd.DataFrame:
    """Load and prepare data from cached CSV."""
    logger.info("Loading data from %s", DATA_PATH)
    start = time.time()
    df = pd.read_csv(DATA_PATH)

    # Drop timestamp columns
    df = df.drop(columns=[c for c in DROP_COLS if c in df.columns])

    elapsed = time.time() - start
    logger.info(
        "Data loaded in %.3fs: shape=%s, columns=%s",
        elapsed,
        df.shape,
        list(df.columns),
    )

    # Log basic stats
    logger.debug("Data types:\n%s", df.dtypes.to_string())
    logger.debug("Numeric summary:\n%s", df.describe().to_string())
    logger.debug("Missing values:\n%s", df.isnull().sum().to_string())

    return df


def get_feature_types(df: pd.DataFrame) -> Tuple[List[str], List[str], List[str]]:
    """Identify feature column types for preprocessing."""
    numeric_features = [
        "age",
        "study_hours_per_day",
        "attendance_percent",
        "sleep_hours",
        "previous_gpa",
    ]
    categorical_features = ["gender", "parental_education"]
    binary_features = ["internet_access", "extracurricular", "part_time_job"]

    numeric_features = [c for c in numeric_features if c in df.columns]
    categorical_features = [c for c in categorical_features if c in df.columns]
    binary_features = [c for c in binary_features if c in df.columns]

    logger.debug(
        "Feature types: numeric=%s, categorical=%s, binary=%s",
        numeric_features,
        categorical_features,
        binary_features,
    )
    return numeric_features, categorical_features, binary_features


def build_preprocessor(
    numeric_features: List[str],
    categorical_features: List[str],
    binary_features: List[str],
) -> ColumnTransformer:
    """Build ColumnTransformer for feature preprocessing."""
    transformers = []

    if numeric_features:
        transformers.append(("num", StandardScaler(), numeric_features))

    if categorical_features:
        transformers.append(
            (
                "cat",
                OneHotEncoder(
                    drop="first", sparse_output=False, handle_unknown="ignore"
                ),
                categorical_features,
            )
        )

    if binary_features:
        transformers.append(("bin", "passthrough", binary_features))

    logger.debug("Preprocessor transformers: %s", [t[0] for t in transformers])
    return ColumnTransformer(transformers, remainder="drop")


# ============================================================
# MODEL EVALUATION WITH DETAILED LOGGING
# ============================================================
def evaluate_regression(model, X, y, cv, model_name: str) -> Dict[str, float]:
    """Evaluate regression model with cross-validation."""
    logger.info("Evaluating %s (regression)...", model_name)
    start = time.time()

    scoring = {
        "r2": "r2",
        "neg_mae": "neg_mean_absolute_error",
        "neg_rmse": "neg_root_mean_squared_error",
        "neg_mse": "neg_mean_squared_error",
    }

    cv_results = cross_validate(
        model, X, y, cv=cv, scoring=scoring, n_jobs=-1, return_train_score=True
    )

    elapsed = time.time() - start

    metrics = {
        "r2_mean": float(cv_results["test_r2"].mean()),
        "r2_std": float(cv_results["test_r2"].std()),
        "r2_train_mean": float(cv_results["train_r2"].mean()),
        "mae_mean": float(-cv_results["test_neg_mae"].mean()),
        "mae_std": float(cv_results["test_neg_mae"].std()),
        "rmse_mean": float(-cv_results["test_neg_rmse"].mean()),
        "rmse_std": float(cv_results["test_neg_rmse"].std()),
        "mse_mean": float(-cv_results["test_neg_mse"].mean()),
        "fit_time_mean": float(cv_results["fit_time"].mean()),
        "score_time_mean": float(cv_results["score_time"].mean()),
        "cv_duration_sec": elapsed,
    }

    logger.info("  CV completed in %.2fs", elapsed)
    logger.info(
        "  R²:     %.4f (±%.4f) [train: %.4f]",
        metrics["r2_mean"],
        metrics["r2_std"],
        metrics["r2_train_mean"],
    )
    logger.info("  MAE:    %.4f (±%.4f)", metrics["mae_mean"], metrics["mae_std"])
    logger.info("  RMSE:   %.4f (±%.4f)", metrics["rmse_mean"], metrics["rmse_std"])
    logger.info("  MSE:    %.4f", metrics["mse_mean"])

    # Overfitting check
    overfit_gap = metrics["r2_train_mean"] - metrics["r2_mean"]
    if overfit_gap > 0.1:
        logger.warning(
            "  [WARN] Possible overfitting: train R² - test R² = %.4f", overfit_gap
        )

    return metrics


def evaluate_classification(model, X, y, cv, model_name: str) -> Dict[str, float]:
    """Evaluate classification model with cross-validation."""
    logger.info("Evaluating %s (classification)...", model_name)
    start = time.time()

    scoring = {
        "accuracy": "accuracy",
        "f1_weighted": "f1_weighted",
        "f1_macro": "f1_macro",
        "precision_weighted": "precision_weighted",
        "recall_weighted": "recall_weighted",
    }

    cv_results = cross_validate(
        model, X, y, cv=cv, scoring=scoring, n_jobs=-1, return_train_score=True
    )

    elapsed = time.time() - start

    metrics = {
        "accuracy_mean": float(cv_results["test_accuracy"].mean()),
        "accuracy_std": float(cv_results["test_accuracy"].std()),
        "accuracy_train_mean": float(cv_results["train_accuracy"].mean()),
        "f1_weighted_mean": float(cv_results["test_f1_weighted"].mean()),
        "f1_weighted_std": float(cv_results["test_f1_weighted"].std()),
        "f1_macro_mean": float(cv_results["test_f1_macro"].mean()),
        "f1_macro_std": float(cv_results["test_f1_macro"].std()),
        "precision_mean": float(cv_results["test_precision_weighted"].mean()),
        "recall_mean": float(cv_results["test_recall_weighted"].mean()),
        "fit_time_mean": float(cv_results["fit_time"].mean()),
        "score_time_mean": float(cv_results["score_time"].mean()),
        "cv_duration_sec": elapsed,
    }

    logger.info("  CV completed in %.2fs", elapsed)
    logger.info(
        "  Accuracy: %.4f (±%.4f) [train: %.4f]",
        metrics["accuracy_mean"],
        metrics["accuracy_std"],
        metrics["accuracy_train_mean"],
    )
    logger.info(
        "  F1 (w):   %.4f (±%.4f)",
        metrics["f1_weighted_mean"],
        metrics["f1_weighted_std"],
    )
    logger.info(
        "  F1 (macro): %.4f (±%.4f)", metrics["f1_macro_mean"], metrics["f1_macro_std"]
    )
    logger.info("  Precision: %.4f", metrics["precision_mean"])
    logger.info("  Recall:    %.4f", metrics["recall_mean"])

    # Overfitting check
    overfit_gap = metrics["accuracy_train_mean"] - metrics["accuracy_mean"]
    if overfit_gap > 0.1:
        logger.warning(
            "  [WARN] Possible overfitting: train Acc - test Acc = %.4f", overfit_gap
        )

    return metrics


# ============================================================
# HYPERPARAMETER TUNING (GridSearchCV + Optuna)
# ============================================================
def tune_regression_model(base_model, param_grid: Dict, X, y, cv, model_name: str):
    """Hyperparameter tuning for regression using GridSearchCV."""
    logger.info("Tuning hyperparameters (GridSearchCV) for %s...", model_name)
    start = time.time()

    grid = GridSearchCV(
        base_model,
        param_grid,
        cv=cv,
        scoring="r2",
        n_jobs=-1,
        verbose=0,
        return_train_score=True,
    )
    grid.fit(X, y)

    elapsed = time.time() - start
    logger.info("  Tuning completed in %.2fs", elapsed)
    logger.info("  Best params: %s", grid.best_params_)
    logger.info("  Best CV R²: %.4f", grid.best_score_)

    # Log all results
    for i, (params, mean_score, std_score) in enumerate(
        zip(
            grid.cv_results_["params"],
            grid.cv_results_["mean_test_score"],
            grid.cv_results_["std_test_score"],
        )
    ):
        logger.debug("  Params: %s -> R²: %.4f (±%.4f)", params, mean_score, std_score)

    return grid.best_estimator_, grid.best_params_, grid.best_score_


def tune_classification_model(base_model, param_grid: Dict, X, y, cv, model_name: str):
    """Hyperparameter tuning for classification using GridSearchCV."""
    logger.info("Tuning hyperparameters (GridSearchCV) for %s...", model_name)
    start = time.time()

    grid = GridSearchCV(
        base_model,
        param_grid,
        cv=cv,
        scoring="f1_weighted",
        n_jobs=-1,
        verbose=0,
        return_train_score=True,
    )
    grid.fit(X, y)

    elapsed = time.time() - start
    logger.info("  Tuning completed in %.2fs", elapsed)
    logger.info("  Best params: %s", grid.best_params_)
    logger.info("  Best CV F1: %.4f", grid.best_score_)

    for i, (params, mean_score, std_score) in enumerate(
        zip(
            grid.cv_results_["params"],
            grid.cv_results_["mean_test_score"],
            grid.cv_results_["std_test_score"],
        )
    ):
        logger.debug("  Params: %s -> F1: %.4f (±%.4f)", params, mean_score, std_score)

    return grid.best_estimator_, grid.best_params_, grid.best_score_


# ============================================================
# OPTUNA BAYESIAN TUNING
# ============================================================
def _optuna_reg_objective(trial, X, y, cv, model_type: str):
    """Optuna objective for regression tuning."""
    if model_type == "xgboost":
        params = {
            "n_estimators": trial.suggest_int("n_estimators", 50, 300, step=50),
            "max_depth": trial.suggest_int("max_depth", 3, 8),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
            "subsample": trial.suggest_float("subsample", 0.6, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
            "min_child_weight": trial.suggest_int("min_child_weight", 1, 10),
            "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 1.0, log=True),
            "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 1.0, log=True),
        }
        model = xgb.XGBRegressor(**params, random_state=42, n_jobs=-1, verbosity=0)
    elif model_type == "catboost":
        params = {
            "iterations": trial.suggest_int("iterations", 100, 400, step=50),
            "depth": trial.suggest_int("depth", 4, 10),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
            "l2_leaf_reg": trial.suggest_float("l2_leaf_reg", 1e-2, 10.0, log=True),
            "random_strength": trial.suggest_float(
                "random_strength", 1e-2, 10.0, log=True
            ),
        }
        model = cb.CatBoostRegressor(
            **params, random_state=42, verbose=False, thread_count=-1
        )
    else:
        raise ValueError(f"Unknown Optuna regression model: {model_type}")

    try:
        scores = cross_val_score(
            model, X, y, cv=cv, scoring="r2", n_jobs=-1, error_score="raise"
        )
        result = float(scores.mean())
        if np.isnan(result):
            return -1.0
        return result
    except (ValueError, RuntimeError):
        return -1.0


def _optuna_clf_objective(trial, X, y, cv, model_type: str):
    """Optuna objective for classification tuning.

    Handles NaN gracefully — small datasets with many classes can produce folds
    missing entire classes, making f1_weighted return NaN. We catch this and
    return a low sentinel score so Optuna avoids those param sets.
    """
    if model_type == "xgboost":
        params = {
            "n_estimators": trial.suggest_int("n_estimators", 100, 300, step=50),
            "max_depth": trial.suggest_int("max_depth", 3, 8),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
            "subsample": trial.suggest_float("subsample", 0.6, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
            "min_child_weight": trial.suggest_int("min_child_weight", 1, 10),
            "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 1.0, log=True),
            "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 1.0, log=True),
        }
        model = xgb.XGBClassifier(**params, random_state=42, n_jobs=-1, verbosity=0)
    elif model_type == "catboost":
        params = {
            "iterations": trial.suggest_int("iterations", 100, 300, step=50),
            "depth": trial.suggest_int("depth", 4, 8),
            "learning_rate": trial.suggest_float("learning_rate", 0.03, 0.2, log=True),
            "l2_leaf_reg": trial.suggest_float("l2_leaf_reg", 1e-2, 10.0, log=True),
            "random_strength": trial.suggest_float(
                "random_strength", 1e-2, 10.0, log=True
            ),
        }
        # NOTE: CatBoost has no `class_weights` param that accepts "Balanced"
        # (that's an scikit-learn convention). CatBoost's correct param is
        # `auto_class_weights`, which accepts "Balanced" / "SqrtBalanced".
        model = cb.CatBoostClassifier(
            **params,
            random_state=42,
            verbose=False,
            thread_count=-1,
            auto_class_weights="Balanced",
        )
    else:
        raise ValueError(f"Unknown Optuna classification model: {model_type}")

    try:
        scores = cross_val_score(
            model, X, y, cv=cv, scoring="f1_weighted", n_jobs=-1, error_score="raise"
        )
        result = float(scores.mean())
        if np.isnan(result):
            return -1.0  # sentinel — tell Optuna this region is bad
        return result
    except (ValueError, RuntimeError):
        # Fold missing a class → NaN → cannot-compute f1
        return -1.0


def tune_with_optuna(
    X, y, cv, model_type: str, task: str = "regression", n_trials: int = 75
) -> Tuple[Any, Dict, float]:
    """Bayesian hyperparameter optimization with Optuna.

    Args:
        X: Feature matrix
        y: Target values
        cv: CV splitter
        model_type: 'xgboost' or 'catboost'
        task: 'regression' or 'classification'
        n_trials: Number of Optuna trials (default 75)

    Returns:
        Tuple of (best_model, best_params, best_score)
    """
    if not HAS_OPTUNA:
        logger.warning(
            "Optuna not installed — skipping Bayesian tuning for %s", model_type
        )
        return None, {}, 0.0

    logger.info(
        "Optuna Bayesian tuning for %s (%s) — %d trials...", model_type, task, n_trials
    )
    start = time.time()

    sampler = optuna.samplers.TPESampler(seed=42)
    study = optuna.create_study(
        direction="maximize",
        sampler=sampler,
        study_name=f"{model_type}_{task}_{datetime.now().strftime('%H%M%S')}",
    )

    if task == "regression":
        objective = lambda trial: _optuna_reg_objective(trial, X, y, cv, model_type)
    else:
        # Use stratified splits for classification so every fold keeps
        # all classes — essential for small datasets with many labels.
        cv_clf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        objective = lambda trial: _optuna_clf_objective(trial, X, y, cv_clf, model_type)

    study.optimize(objective, n_trials=n_trials, n_jobs=1, show_progress_bar=False)

    elapsed = time.time() - start
    logger.info("  Optuna tuning completed in %.2fs", elapsed)
    logger.info("  Best params: %s", study.best_params)
    logger.info("  Best CV score: %.4f", study.best_value)
    logger.info(
        "  Trials: %d completed, %d pruned",
        len(study.trials),
        sum(1 for t in study.trials if t.state == optuna.trial.TrialState.PRUNED),
    )

    # Build the best model
    if model_type == "xgboost":
        if task == "regression":
            best_model = xgb.XGBRegressor(
                **study.best_params, random_state=42, n_jobs=-1, verbosity=0
            )
        else:
            best_model = xgb.XGBClassifier(
                **study.best_params, random_state=42, n_jobs=-1, verbosity=0
            )
    elif model_type == "catboost":
        if task == "regression":
            best_model = cb.CatBoostRegressor(
                **study.best_params, random_state=42, verbose=False, thread_count=-1
            )
        else:
            # Keep class balancing consistent with the Optuna objective above.
            best_model = cb.CatBoostClassifier(
                **study.best_params,
                random_state=42,
                verbose=False,
                thread_count=-1,
                auto_class_weights="Balanced",
            )
    else:
        raise ValueError(f"Unknown model_type: {model_type}")

    best_model.fit(X, y)

    return best_model, study.best_params, study.best_value


# ============================================================
# FEATURE ENGINEERING
# ============================================================
def build_engineered_preprocessor(
    numeric_features: List[str],
    categorical_features: List[str],
    binary_features: List[str],
) -> ColumnTransformer:
    """Build preprocessor with polynomial features and interaction terms."""
    transformers = []

    if numeric_features:
        # Numeric pipeline: StandardScaler → PolynomialFeatures (degree 2, no bias)
        num_pipeline = Pipeline(
            [
                ("scaler", StandardScaler()),
                (
                    "poly",
                    PolynomialFeatures(
                        degree=2, include_bias=False, interaction_only=False
                    ),
                ),
            ]
        )
        transformers.append(("num", num_pipeline, numeric_features))

    if categorical_features:
        transformers.append(
            (
                "cat",
                OneHotEncoder(
                    drop="first", sparse_output=False, handle_unknown="ignore"
                ),
                categorical_features,
            )
        )

    if binary_features:
        transformers.append(("bin", "passthrough", binary_features))

    logger.debug(
        "Enhanced preprocessor (with PolynomialFeatures): %s",
        [t[0] for t in transformers],
    )
    return ColumnTransformer(transformers, remainder="drop")


def create_interaction_features(
    df: pd.DataFrame, numeric_features: List[str]
) -> pd.DataFrame:
    """Create manual interaction terms for selected numeric features."""
    df_inter = df.copy()
    interactions = []

    # Study habits interactions
    if "study_hours_per_day" in df.columns and "attendance_percent" in df.columns:
        df_inter["study_attendance_interaction"] = (
            df["study_hours_per_day"].clip(0, 16) * df["attendance_percent"] / 100.0
        )
        interactions.append("study_attendance_interaction")

    if "study_hours_per_day" in df.columns and "previous_gpa" in df.columns:
        df_inter["study_gpa_interaction"] = df["study_hours_per_day"].clip(0, 16) * df[
            "previous_gpa"
        ].clip(0, 4)
        interactions.append("study_gpa_interaction")

    if "sleep_hours" in df.columns and "attendance_percent" in df.columns:
        df_inter["sleep_attendance_interaction"] = (
            df["sleep_hours"].clip(0, 16) * df["attendance_percent"] / 100.0
        )
        interactions.append("sleep_attendance_interaction")

    if "attendance_percent" in df.columns and "previous_gpa" in df.columns:
        df_inter["attendance_gpa_interaction"] = (
            df["attendance_percent"] * df["previous_gpa"].clip(0, 3) / 100.0
        )
        interactions.append("attendance_gpa_interaction")

    if len(interactions) > 0:
        logger.info("Created interaction features: %s", interactions)

    return df_inter


# ============================================================
# SHAP ANALYSIS
# ============================================================
def compute_shap_analysis(
    model,
    X,
    y,
    feature_names: List[str],
    output_dir,
    model_name: str,
    task: str = "regression",
):
    """Compute SHAP values and produce interpretability plots.

    Only runs on a sample (max 100 rows) due to computational cost.
    """
    if not HAS_SHAP:
        logger.warning("SHAP not installed — skipping SHAP analysis")
        return None

    logger.info("Computing SHAP analysis for %s (%s)...", model_name, task)
    start = time.time()

    # Sample for efficiency (SHAP is O(n²) in TreeExplainer) 
    n_sample = min(100, X.shape[0])
    rng = np.random.RandomState(42)
    if X.shape[0] > n_sample:
        idx = rng.choice(X.shape[0], n_sample, replace=False)
        X_sample = X[idx]
    else:
        X_sample = X
        idx = np.arange(X.shape[0])

    try:
        # Tree-based explainer (fast path)
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(X_sample)

        # For classification, shap_values is a list of arrays (one per class)
        if isinstance(shap_values, list):
            # Use the last class (typically the best)
            shap_to_plot = shap_values[-1]
        else:
            shap_to_plot = shap_values

        elapsed = time.time() - start
        logger.info("  SHAP values computed in %.2fs", elapsed)

        # Summary plot (feature importance by SHAP)
        plt.figure(figsize=(12, 8))
        shap.summary_plot(
            shap_to_plot,
            X_sample,
            feature_names=feature_names,
            show=False,
            max_display=min(20, len(feature_names)),
        )
        plt.tight_layout()
        shap_summary_path = (
            output_dir
            / f"shap_summary_{task}_{model_name.lower().replace(' ', '_')}.png"
        )
        plt.savefig(shap_summary_path, dpi=150, bbox_inches="tight")
        plt.close()
        logger.info("  SHAP summary plot saved to %s", shap_summary_path)

        # Mean |SHAP| bar plot (most interpretable)
        plt.figure(figsize=(10, 8))
        shap_summary = (
            pd.DataFrame(
                {
                    "feature": feature_names,
                    "shap_importance": np.abs(shap_to_plot).mean(axis=0),
                }
            )
            .sort_values("shap_importance", ascending=True)
            .tail(15)
        )

        colors = plt.cm.magma(np.linspace(0.3, 0.8, len(shap_summary)))
        plt.barh(
            range(len(shap_summary)), shap_summary["shap_importance"], color=colors
        )
        plt.yticks(range(len(shap_summary)), shap_summary["feature"])
        plt.xlabel("Mean |SHAP| Importance")
        plt.title(f"{model_name}: SHAP Feature Importance ({task})")
        plt.tight_layout()
        shap_bar_path = output_dir / f"shap_importance_{task}.png"
        plt.savefig(shap_bar_path, dpi=150, bbox_inches="tight")
        plt.close()
        logger.info("  SHAP importance bar plot saved to %s", shap_bar_path)

    except Exception as e:
        logger.warning("  SHAP analysis failed for %s: %s", model_name, e)


# ============================================================
# MODEL TRAINING WITH TUNING
# ============================================================
def train_regression_models(X, y, cv) -> Tuple[Tuple[str, Any], Dict]:
    """Train and compare regression models with GridSearchCV + Optuna tuning + Ensembles."""
    log_section("REGRESSION: Predicting Final_Score")

    # --- Base Models ---
    model_configs = {
        "RidgeCV": {
            "model": RidgeCV(alphas=[0.01, 0.1, 1.0, 10.0, 100.0], cv=5),
            "param_grid": {},
            "tune": False,  # RidgeCV has built-in CV
            "tuner": "none",
        },
        "RandomForest": {
            "model": RandomForestRegressor(random_state=42, n_jobs=-1),
            "param_grid": {
                "n_estimators": [200, 300],
                "max_depth": [4, 5, 6, None],
                "min_samples_split": [3, 5, 8],
                "min_samples_leaf": [1, 2, 3],
            },
            "tune": True,
            "tuner": "grid",
        },
        "GradientBoosting": {
            "model": GradientBoostingRegressor(random_state=42),
            "param_grid": {
                "n_estimators": [100, 150, 200],
                "max_depth": [3, 4, 5],
                "learning_rate": [0.05, 0.1],
                "min_samples_split": [5, 8],
                "subsample": [0.8, 1.0],
            },
            "tune": True,
            "tuner": "grid",
        },
        **(
            {
                "XGBoost": {
                    "model": None,  # will be replaced by Optuna-tuned model
                    "param_grid": [],
                    "tune": True,
                    "tuner": "optuna",  # Bayesian optimization
                    "optuna_type": "xgboost",
                },
            }
            if HAS_XGB
            else {}
        ),
        **(
            {
                "CatBoost": {
                    "model": None,
                    "param_grid": [],
                    "tune": True,
                    "tuner": "optuna",
                    "optuna_type": "catboost",
                },
            }
            if HAS_CAT
            else {}
        ),
    }

    trained_models = {}  # name → trained estimator (for ensembles)
    results = {}
    tuning_info = {}

    for name, config in model_configs.items():
        log_subsection(f"Model: {name}")

        tuner = config.get("tuner", "grid")

        if tuner == "optuna":
            opt_type = config.get("optuna_type", "xgboost")
            tuned_model, best_params, best_cv_score = tune_with_optuna(
                X, y, cv, model_type=opt_type, task="regression", n_trials=75
            )
            if tuned_model is None:
                continue
            metrics = evaluate_regression(tuned_model, X, y, cv, name)
            tuning_info[name] = {
                "best_params": best_params,
                "best_cv_score": best_cv_score,
                "tuner": "optuna",
            }
        elif config["tune"] and config["param_grid"]:
            tuned_model, best_params, best_cv_score = tune_regression_model(
                config["model"], config["param_grid"], X, y, cv, name
            )
            metrics = evaluate_regression(tuned_model, X, y, cv, name)
            tuning_info[name] = {
                "best_params": best_params,
                "best_cv_score": best_cv_score,
                "tuner": "grid",
            }
        else:
            model = config["model"]
            metrics = evaluate_regression(model, X, y, cv, name)
            tuned_model = model
            tuning_info[name] = {
                "best_params": "N/A (built-in CV)",
                "best_cv_score": metrics["r2_mean"],
                "tuner": "none",
            }

        results[name] = metrics
        trained_models[name] = tuned_model

    # --- Ensemble Models ---
    # Collect the top 3 individual models for ensembling
    sorted_models = sorted(results.items(), key=lambda x: x[1]["r2_mean"], reverse=True)
    top3_names = [n for n, _ in sorted_models[:3]]
    top3_estimators = [
        (n.lower().replace(" ", "_"), clone(trained_models[n])) for n in top3_names
    ]

    logger.info("\nBuilding ensembles from top 3: %s", top3_names)

    # Voting Ensemble (average predictions)
    voting = VotingRegressor(top3_estimators)
    voting_metrics = evaluate_regression(voting, X, y, cv, "Ensemble_Voting")
    results["Ensemble_Voting"] = voting_metrics
    trained_models["Ensemble_Voting"] = voting
    tuning_info["Ensemble_Voting"] = {"ensemble_of": top3_names, "tuner": "ensemble"}

    # Stacking Ensemble (meta-learner: RidgeCV)
    stacking = StackingRegressor(
        top3_estimators,
        final_estimator=RidgeCV(alphas=[0.01, 0.1, 1.0, 10.0], cv=3),
        cv=5,
        n_jobs=-1,
    )
    stacking_metrics = evaluate_regression(stacking, X, y, cv, "Ensemble_Stacking")
    results["Ensemble_Stacking"] = stacking_metrics
    trained_models["Ensemble_Stacking"] = stacking
    tuning_info["Ensemble_Stacking"] = {
        "ensemble_of": top3_names,
        "meta_learner": "RidgeCV",
        "tuner": "ensemble",
    }

    # Select best model
    best_name = max(results, key=lambda n: results[n]["r2_mean"])
    best_score = results[best_name]["r2_mean"]
    best_model = (best_name, trained_models[best_name])

    logger.info("\n--- Regression Summary ---")
    for name in sorted(results, key=lambda n: results[n]["r2_mean"], reverse=True):
        logger.info(
            "  %-22s  R²=%.4f (±%.4f)  MAE=%.4f  RMSE=%.4f",
            name,
            results[name]["r2_mean"],
            results[name]["r2_std"],
            results[name]["mae_mean"],
            results[name]["rmse_mean"],
        )

    logger.info("\n> Best regression: %s (R² = %.4f)", best_name, best_score)
    return best_model, results, tuning_info


def train_classification_models(X, y, cv) -> Tuple[Tuple[str, Any], Dict]:
    """Train and compare classification models with GridSearchCV + Optuna tuning + Ensembles."""
    log_section("CLASSIFICATION: Predicting Grade")

    # --- Base Models ---
    model_configs = {
        "LogisticRegressionCV": {
            "model": LogisticRegressionCV(
                Cs=[0.01, 0.1, 1.0, 5.0, 10.0, 50.0],
                cv=5,
                max_iter=3000,
                random_state=42,
                n_jobs=-1,
            ),
            "param_grid": {},
            "tune": False,
            "tuner": "none",
        },
        "RandomForest": {
            "model": RandomForestClassifier(random_state=42, n_jobs=-1),
            "param_grid": {
                "n_estimators": [200, 300],
                "max_depth": [4, 5, 6, None],
                "min_samples_split": [3, 5, 8],
                "min_samples_leaf": [1, 2, 3],
                "class_weight": ["balanced", None],
            },
            "tune": True,
            "tuner": "grid",
        },
        "GradientBoosting": {
            "model": GradientBoostingClassifier(random_state=42),
            "param_grid": {
                "n_estimators": [100, 150, 200],
                "max_depth": [3, 4, 5],
                "learning_rate": [0.05, 0.1],
                "min_samples_split": [5, 8],
                "subsample": [0.8, 1.0],
            },
            "tune": True,
            "tuner": "grid",
        },
        **(
            {
                "XGBoost": {
                    "model": None,
                    "param_grid": [],
                    "tune": True,
                    "tuner": "optuna",
                    "optuna_type": "xgboost",
                },
            }
            if HAS_XGB
            else {}
        ),
        **(
            {
                "CatBoost": {
                    "model": None,
                    "param_grid": [],
                    "tune": True,
                    "tuner": "optuna",
                    "optuna_type": "catboost",
                },
            }
            if HAS_CAT
            else {}
        ),
    }

    trained_models = {}
    results = {}
    tuning_info = {}
    n_classes = len(np.unique(y))

    for name, config in model_configs.items():
        log_subsection(f"Model: {name}")

        tuner = config.get("tuner", "grid")

        if tuner == "optuna":
            opt_type = config.get("optuna_type", "xgboost")
            tuned_model, best_params, best_cv_score = tune_with_optuna(
                X, y, cv, model_type=opt_type, task="classification", n_trials=75
            )
            if tuned_model is None:
                continue
            metrics = evaluate_classification(tuned_model, X, y, cv, name)
            tuning_info[name] = {
                "best_params": best_params,
                "best_cv_score": best_cv_score,
                "tuner": "optuna",
            }
        elif config["tune"] and config["param_grid"]:
            tuned_model, best_params, best_cv_score = tune_classification_model(
                config["model"], config["param_grid"], X, y, cv, name
            )
            metrics = evaluate_classification(tuned_model, X, y, cv, name)
            tuning_info[name] = {
                "best_params": best_params,
                "best_cv_score": best_cv_score,
                "tuner": "grid",
            }
        else:
            model = config["model"]
            metrics = evaluate_classification(model, X, y, cv, name)
            tuned_model = model
            tuning_info[name] = {
                "best_params": "N/A (built-in CV)",
                "best_cv_score": metrics["accuracy_mean"],
                "tuner": "none",
            }

        results[name] = metrics
        trained_models[name] = tuned_model

    # --- Ensemble Models ---
    sorted_models = sorted(
        results.items(), key=lambda x: x[1]["accuracy_mean"], reverse=True
    )
    top3_names = [n for n, _ in sorted_models[:3]]
    top3_estimators = [
        (n.lower().replace(" ", "_"), clone(trained_models[n])) for n in top3_names
    ]

    logger.info("\nBuilding ensembles from top 3: %s", top3_names)

    # Voting Ensemble (soft voting if available)
    voting_clf = VotingClassifier(top3_estimators, voting="soft")
    voting_metrics = evaluate_classification(voting_clf, X, y, cv, "Ensemble_Voting")
    results["Ensemble_Voting"] = voting_metrics
    trained_models["Ensemble_Voting"] = voting_clf
    tuning_info["Ensemble_Voting"] = {
        "ensemble_of": top3_names,
        "tuner": "ensemble",
        "voting": "soft",
    }

    # Stacking Ensemble (meta-learner: LogisticRegressionCV)
    stacking = StackingClassifier(
        top3_estimators,
        final_estimator=LogisticRegressionCV(
            Cs=10, cv=3, max_iter=1000, random_state=42, n_jobs=-1
        ),
        cv=5,
        n_jobs=-1,
        stack_method="predict_proba",
    )
    stacking_metrics = evaluate_classification(stacking, X, y, cv, "Ensemble_Stacking")
    results["Ensemble_Stacking"] = stacking_metrics
    trained_models["Ensemble_Stacking"] = stacking
    tuning_info["Ensemble_Stacking"] = {
        "ensemble_of": top3_names,
        "meta_learner": "LogisticRegressionCV",
        "tuner": "ensemble",
    }

    # Select best model
    best_name = max(results, key=lambda n: results[n]["accuracy_mean"])
    best_score = results[best_name]["accuracy_mean"]
    best_model = (best_name, trained_models[best_name])

    logger.info("\n--- Classification Summary ---")
    for name in sorted(
        results, key=lambda n: results[n]["accuracy_mean"], reverse=True
    ):
        logger.info(
            "  %-22s  Acc=%.4f (±%.4f)  F1w=%.4f  F1m=%.4f",
            name,
            results[name]["accuracy_mean"],
            results[name]["accuracy_std"],
            results[name]["f1_weighted_mean"],
            results[name]["f1_macro_mean"],
        )

    logger.info("\n> Best classification: %s (Acc = %.4f)", best_name, best_score)
    return best_model, results, tuning_info


# ============================================================
# PERMUTATION IMPORTANCE (MODEL-AGNOSTIC)
# ============================================================
def compute_permutation_importance(
    model, X, y, feature_names: List[str], model_name: str, n_repeats: int = 10
) -> Dict:
    """Compute permutation importance for model-agnostic feature importance."""
    logger.info("Computing permutation importance for %s...", model_name)
    start = time.time()

    result = permutation_importance(
        model, X, y, n_repeats=n_repeats, random_state=42, n_jobs=-1
    )

    elapsed = time.time() - start

    # Create importance dict
    importance_dict = {
        "features": feature_names,
        "importances_mean": result.importances_mean.tolist(),
        "importances_std": result.importances_std.tolist(),
        "duration_sec": elapsed,
    }

    # Log top features
    sorted_idx = np.argsort(result.importances_mean)[::-1]
    logger.info("  Top 10 features (permutation importance):")
    for i in sorted_idx[:10]:
        logger.info(
            "    %s: %.4f (±%.4f)",
            feature_names[i],
            result.importances_mean[i],
            result.importances_std[i],
        )

    return importance_dict


# ============================================================
# PLOTTING (ENHANCED)
# ============================================================
def get_feature_names_after_preprocessing(
    preprocessor, original_names: Tuple
) -> List[str]:
    """Get feature names after preprocessing (handles Pipeline with PolynomialFeatures)."""
    try:
        # Extract numeric transformed feature names (handles Pipeline with poly)
        num_transformer = preprocessor.named_transformers_["num"]
        if hasattr(num_transformer, 'named_steps') and 'poly' in num_transformer.named_steps:
            num_features = num_transformer.named_steps['poly'].get_feature_names_out(
                original_names[0]  # original numeric feature names
            )
        else:
            num_features = np.array(original_names[0])

        # Categorical one-hot encoded names
        cat_features = preprocessor.named_transformers_.get("cat")
        if cat_features and hasattr(cat_features, 'get_feature_names_out'):
            cat_features = cat_features.get_feature_names_out()
        else:
            cat_features = np.array([])

        # Binary passthrough
        bin_features = np.array(original_names[2] if len(original_names) > 2 else [])

        all_features = np.concatenate([num_features, cat_features, bin_features])
        return all_features.tolist()
    except Exception as e:
        logger.warning("Could not get encoded feature names: %s", e)
        try:
            return [str(n) for n in np.concatenate(original_names)]
        except Exception:
            return [f"feature_{i}" for i in range(50)]


def plot_feature_importance(
    model, preprocessor, feature_names: Tuple, output_path: Path, model_name: str
):
    """Plot and save feature importance."""
    all_features = get_feature_names_after_preprocessing(preprocessor, feature_names)

    # Get importances
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
        source = "builtin"
    elif hasattr(model, "coef_"):
        importances = np.abs(model.coef_).flatten()
        source = "coef_abs"
    else:
        logger.warning("No feature importance available for %s", model_name)
        return

    # Create importance dataframe
    imp_df = pd.DataFrame({"feature": all_features, "importance": importances})
    imp_df = imp_df.sort_values("importance", ascending=True).tail(15)

    # Plot
    plt.figure(figsize=(10, 8))
    colors = plt.cm.viridis(np.linspace(0.2, 0.8, len(imp_df)))
    plt.barh(range(len(imp_df)), imp_df["importance"], color=colors)
    plt.yticks(range(len(imp_df)), imp_df["feature"])
    plt.xlabel("Importance")
    plt.title(f"{model_name}: Feature Importance (Top 15)")
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    logger.info("Feature importance plot saved to %s", output_path)


def plot_predictions_vs_actual(model, X, y, output_path: Path, target_name: str):
    """Plot predictions vs actual values with residual plot."""
    preds = model.predict(X)
    residuals = y - preds

    fig, axes = plt.subplots(1, 2, figsize=(14, 6))

    # Predictions vs Actual
    axes[0].scatter(y, preds, alpha=0.6, edgecolors="k", linewidth=0.5)
    axes[0].plot([y.min(), y.max()], [y.min(), y.max()], "r--", lw=2, label="Perfect")
    axes[0].set_xlabel("Actual")
    axes[0].set_ylabel("Predicted")
    axes[0].set_title(f"{target_name}: Predicted vs Actual")
    axes[0].legend()
    axes[0].grid(True, alpha=0.3)

    # Residuals
    axes[1].scatter(preds, residuals, alpha=0.6, edgecolors="k", linewidth=0.5)
    axes[1].axhline(y=0, color="r", linestyle="--", lw=2)
    axes[1].set_xlabel("Predicted")
    axes[1].set_ylabel("Residual (Actual - Predicted)")
    axes[1].set_title(f"{target_name}: Residual Plot")
    axes[1].grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    logger.info("Predictions vs Actual plot saved to %s", output_path)


def plot_confusion_matrix(model, X, y, output_path: Path, model_name: str):
    """Plot confusion matrix for classification."""
    preds = model.predict(X)
    cm = confusion_matrix(y, preds)

    plt.figure(figsize=(8, 6))
    sns.heatmap(
        cm,
        annot=True,
        fmt="d",
        cmap="Blues",
        xticklabels=sorted(GRADE_MAP.keys()),
        yticklabels=sorted(GRADE_MAP.keys()),
    )
    plt.xlabel("Predicted")
    plt.ylabel("Actual")
    plt.title(f"{model_name}: Confusion Matrix")
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    logger.info("Confusion matrix saved to %s", output_path)


def plot_learning_curves(model, X, y, output_path: Path, model_name: str):
    """Plot learning curves to diagnose bias/variance."""
    from sklearn.model_selection import learning_curve

    train_sizes, train_scores, val_scores = learning_curve(
        model,
        X,
        y,
        cv=5,
        n_jobs=-1,
        train_sizes=np.linspace(0.1, 1.0, 10),
        scoring="r2" if hasattr(model, "predict_proba") is False else "accuracy",
    )

    train_mean = np.mean(train_scores, axis=1)
    train_std = np.std(train_scores, axis=1)
    val_mean = np.mean(val_scores, axis=1)
    val_std = np.std(val_scores, axis=1)

    plt.figure(figsize=(10, 6))
    plt.plot(train_sizes, train_mean, "o-", label="Training score", color="blue")
    plt.fill_between(
        train_sizes,
        train_mean - train_std,
        train_mean + train_std,
        alpha=0.1,
        color="blue",
    )
    plt.plot(train_sizes, val_mean, "o-", label="Validation score", color="red")
    plt.fill_between(
        train_sizes, val_mean - val_std, val_mean + val_std, alpha=0.1, color="red"
    )
    plt.xlabel("Training Set Size")
    plt.ylabel("Score")
    plt.title(f"{model_name}: Learning Curve")
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    logger.info("Learning curve saved to %s", output_path)


# ============================================================
# MAIN TRAINING PIPELINE
# ============================================================
def main():
    global logger, log_file_path

    # Setup logging
    logger, log_file_path = setup_logging()

    log_section("STUDENT PERFORMANCE MODEL TRAINING")
    logger.info("Log file: %s", log_file_path)
    logger.info("Project root: %s", PROJECT_ROOT)
    logger.info("Data path: %s", DATA_PATH)
    logger.info("Models dir: %s", MODELS_DIR)
    logger.info("Output dir: %s", OUTPUT_DIR)

    overall_start = time.time()

    # Load data
    df = load_data()

    # Get feature types
    numeric_features, categorical_features, binary_features = get_feature_types(df)
    feature_names = (numeric_features, categorical_features, binary_features)

    logger.info("Numeric features: %s", numeric_features)
    logger.info("Categorical features: %s", categorical_features)
    logger.info("Binary features: %s", binary_features)

    # Prepare X and y
    X = df.drop(columns=[TARGET_REG, TARGET_CLF])
    y_reg = df[TARGET_REG].values
    y_clf = df[TARGET_CLF].map(GRADE_MAP).values

    # Feature engineering: add interaction terms
    X_enhanced = create_interaction_features(X, numeric_features)
    interaction_cols = [c for c in X_enhanced.columns if '_interaction' in c]
    extended_numeric = numeric_features + interaction_cols

    logger.info(
        "Target regression range: [%d, %d], mean=%.2f",
        y_reg.min(),
        y_reg.max(),
        y_reg.mean(),
    )
    logger.info(
        "Target classification distribution: %s",
        dict(zip(*np.unique(y_clf, return_counts=True))),
    )

    # Build preprocessor with feature engineering
    preprocessor = build_engineered_preprocessor(
        extended_numeric, categorical_features, binary_features
    )

    # Fit preprocessor
    X_transformed = preprocessor.fit_transform(X_enhanced)
    logger.info("Transformed feature shape: %s (with interactions + poly)", X_transformed.shape)

    # Update feature_names for downstream use
    feature_names = (extended_numeric, categorical_features, binary_features)

    # Get final feature names for interpretation
    final_feature_names = get_feature_names_after_preprocessing(
        preprocessor, feature_names
    )
    logger.debug(
        "Final feature names (%d): %s", len(final_feature_names), final_feature_names
    )

    # Cross-validation strategy
    cv = RepeatedKFold(n_splits=5, n_repeats=3, random_state=42)
    logger.info("CV strategy: RepeatedKFold(n_splits=5, n_repeats=3) = %d folds", 5 * 3)

    # Train regression models
    reg_start = time.time()
    (best_reg_name, best_reg_model), reg_results, reg_tuning = train_regression_models(
        X_transformed, y_reg, cv
    )
    logger.info("Regression training took %.2fs", time.time() - reg_start)

    # Train classification models
    clf_start = time.time()
    (best_clf_name, best_clf_model), clf_results, clf_tuning = (
        train_classification_models(X_transformed, y_clf, cv)
    )
    logger.info("Classification training took %.2fs", time.time() - clf_start)

    # Fit best models on full data
    log_section("FITTING BEST MODELS ON FULL DATASET")
    logger.info("Fitting %s (regression)...", best_reg_name)
    best_reg_model.fit(X_transformed, y_reg)
    logger.info("Fitting %s (classification)...", best_clf_name)
    best_clf_model.fit(X_transformed, y_clf)

    # Compute permutation importance (model-agnostic)
    log_section("PERMUTATION IMPORTANCE")
    reg_perm_imp = compute_permutation_importance(
        best_reg_model, X_transformed, y_reg, final_feature_names, best_reg_name
    )
    clf_perm_imp = compute_permutation_importance(
        best_clf_model, X_transformed, y_clf, final_feature_names, best_clf_name
    )

    # Save models and preprocessor
    log_section("SAVING MODELS")
    joblib.dump(best_reg_model, MODELS_DIR / "regressor.joblib")
    joblib.dump(best_clf_model, MODELS_DIR / "classifier.joblib")
    joblib.dump(preprocessor, MODELS_DIR / "preprocessor.joblib")
    logger.info("Models saved to %s", MODELS_DIR)

    # Save comprehensive metrics
    metrics = {
        "timestamp": datetime.now().isoformat(),
        "data_info": {
            "n_samples": int(len(df)),
            "n_features": int(X_transformed.shape[1]),
            "target_reg_range": [int(y_reg.min()), int(y_reg.max())],
            "target_clf_distribution": {
                str(k): int(v) for k, v in zip(*np.unique(y_clf, return_counts=True))
            },
            "feature_names": final_feature_names,
        },
        "cv_strategy": "RepeatedKFold(n_splits=5, n_repeats=3)",
        "regression": {
            "best_model": best_reg_name,
            "cv_results": reg_results,
            "tuning_info": reg_tuning,
            "permutation_importance": reg_perm_imp,
        },
        "classification": {
            "best_model": best_clf_name,
            "cv_results": clf_results,
            "tuning_info": clf_tuning,
            "permutation_importance": clf_perm_imp,
            "grade_map": GRADE_MAP,
        },
        "feature_info": {
            "numeric_features": numeric_features,
            "categorical_features": categorical_features,
            "binary_features": binary_features,
        },
        "training_duration_sec": time.time() - overall_start,
    }

    with open(MODELS_DIR / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2, default=str)
    logger.info("Metrics saved to %s/metrics.json", MODELS_DIR)

    # Also save a training log summary
    training_log = {
        "timestamp": datetime.now().isoformat(),
        "log_file": str(log_file_path),
        "best_regression": {
            "model": best_reg_name,
            "r2_mean": reg_results[best_reg_name]["r2_mean"],
            "r2_std": reg_results[best_reg_name]["r2_std"],
            "mae_mean": reg_results[best_reg_name]["mae_mean"],
            "rmse_mean": reg_results[best_reg_name]["rmse_mean"],
        },
        "best_classification": {
            "model": best_clf_name,
            "accuracy_mean": clf_results[best_clf_name]["accuracy_mean"],
            "accuracy_std": clf_results[best_clf_name]["accuracy_std"],
            "f1_weighted_mean": clf_results[best_clf_name]["f1_weighted_mean"],
            "f1_macro_mean": clf_results[best_clf_name]["f1_macro_mean"],
        },
        "total_duration_sec": time.time() - overall_start,
    }

    with open(LOGS_DIR / "training_summary_latest.json", "w") as f:
        json.dump(training_log, f, indent=2)
    logger.info("Training summary saved to %s/training_summary_latest.json", LOGS_DIR)

    # Generate plots
    log_section("GENERATING PLOTS")
    plot_feature_importance(
        best_reg_model,
        preprocessor,
        feature_names,
        OUTPUT_DIR / "feature_importance_regression.png",
        best_reg_name,
    )
    plot_feature_importance(
        best_clf_model,
        preprocessor,
        feature_names,
        OUTPUT_DIR / "feature_importance_classification.png",
        best_clf_name,
    )
    plot_predictions_vs_actual(
        best_reg_model,
        X_transformed,
        y_reg,
        OUTPUT_DIR / "predictions_vs_actual_regression.png",
        "Final Score",
    )
    plot_confusion_matrix(
        best_clf_model,
        X_transformed,
        y_clf,
        OUTPUT_DIR / "confusion_matrix.png",
        best_clf_name,
    )
    plot_learning_curves(
        best_reg_model,
        X_transformed,
        y_reg,
        OUTPUT_DIR / "learning_curve_regression.png",
        best_reg_name,
    )
    plot_learning_curves(
        best_clf_model,
        X_transformed,
        y_clf,
        OUTPUT_DIR / "learning_curve_classification.png",
        best_clf_name,
    )

    # SHAP analysis (model interpretability)
    if HAS_SHAP:
        log_section("SHAP ANALYSIS")
        compute_shap_analysis(
            best_reg_model, X_transformed, y_reg, final_feature_names,
            OUTPUT_DIR, best_reg_name, task='regression'
        )
        compute_shap_analysis(
            best_clf_model, X_transformed, y_clf, final_feature_names,
            OUTPUT_DIR, best_clf_name, task='classification'
        )
    else:
        logger.info("SHAP not available — skipping interpretability analysis")

    # Final summary
    total_elapsed = time.time() - overall_start
    log_section("TRAINING COMPLETE")
    logger.info("Total training time: %.2fs", total_elapsed)
    logger.info("Models saved to: %s", MODELS_DIR)
    logger.info("Plots saved to: %s", OUTPUT_DIR)
    logger.info("Logs saved to: %s", LOGS_DIR)
    logger.info(
        "Best regression: %s (R² = %.4f ± %.4f)",
        best_reg_name,
        reg_results[best_reg_name]["r2_mean"],
        reg_results[best_reg_name]["r2_std"],
    )
    logger.info(
        "Best classification: %s (Acc = %.4f ± %.4f, F1 = %.4f)",
        best_clf_name,
        clf_results[best_clf_name]["accuracy_mean"],
        clf_results[best_clf_name]["accuracy_std"],
        clf_results[best_clf_name]["f1_weighted_mean"],
    )
    logger.info("Log file: %s", log_file_path)


if __name__ == "__main__":
    main()
