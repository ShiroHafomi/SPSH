#!/usr/bin/env python3
"""
inference_llm.py — Run fine-tuned LLM for academic feedback generation.

Generates personalized study recommendations from a student profile JSON
using a base model + LoRA adapter trained with train_lora.py.

Usage:
    # Pipe a JSON student profile
    echo '{"gender":"Female","age":19,...}' | py inference_llm.py --stdin

    # From file
    py inference_llm.py --profile student_example.json

    # CLI args
    py inference_llm.py --gender Female --age 19 --study-hours 4.5 \\
                         --attendance 95 --sleep 8 --gpa 3.8 \\
                         --parental PhD --internet-access Yes \\
                         --extracurricular Yes --part-time-job No

    # Use base model (no LoRA)
    py inference_llm.py --profile data.json --base-only
"""

import argparse
import json
import os
import sys
from pathlib import Path

DEFAULT_MODEL = "meta-llama/Llama-3.2-3B-Instruct"
ADAPTER_DIR = os.path.join(os.path.dirname(__file__), "adapter")


def build_prompt(profile):
    """Build a natural-language instruction from a student profile dict."""
    parts = [
        f"Gender: {profile.get('gender', 'unknown')}",
        f"Age: {profile.get('age', 'unknown')}",
        f"Study Hours/Day: {profile.get('study_hours_per_day', 'N/A')}",
        f"Attendance: {profile.get('attendance_percent', 'N/A')}%",
        f"Sleep Hours: {profile.get('sleep_hours', 'N/A')}",
        f"Previous GPA: {profile.get('previous_gpa', 'N/A')}",
        f"Parental Education: {profile.get('parental_education', 'unknown')}",
        f"Internet Access: {profile.get('internet_access', 'unknown')}",
        f"Extracurricular: {profile.get('extracurricular', 'unknown')}",
        f"Part-Time Job: {profile.get('part_time_job', 'unknown')}",
    ]

    return (
        "You are an academic counselor. Analyze the student profile below "
        "and provide: (1) Predicted Final Score (2) Predicted Grade (A–F) "
        "(3) 2–4 personalized study recommendations. Be specific and actionable.\n\n"
        "### Student Profile:\n"
        + "\n".join(parts)
        + "\n\n### Response:"
    )


def load_model(base_model, adapter_path=None, device="cuda"):
    """Load model + optional LoRA adapter."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel

    tokenizer = AutoTokenizer.from_pretrained(
        base_model if not adapter_path else adapter_path
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    load_kwargs = {
        "torch_dtype": torch.bfloat16 if device == "cuda" else torch.float32,
        "trust_remote_code": False,
    }
    if device == "cuda":
        load_kwargs["device_map"] = "auto"
    else:
        load_kwargs["device_map"] = "cpu"

    model = AutoModelForCausalLM.from_pretrained(base_model, **load_kwargs)

    if adapter_path and os.path.isdir(adapter_path):
        print(f"🔌 Loading LoRA adapter from: {adapter_path}")
        model = PeftModel.from_pretrained(model, adapter_path)
        model = model.merge_and_unload()
    elif adapter_path:
        print(f"⚠️  Adapter not found at {adapter_path} — using base model only")

    model.eval()
    return model, tokenizer


def generate(model, tokenizer, prompt, max_new_tokens=256, device="cuda"):
    """Run inference on a single prompt."""
    import torch

    inputs = tokenizer(prompt, return_tensors="pt").to(
        model.device if hasattr(model, "device") else device
    )

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=True,
            temperature=0.6,
            top_p=0.9,
            top_k=40,
            repetition_penalty=1.1,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )

    generated_ids = outputs[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(generated_ids, skip_special_tokens=True).strip()


def main():
    parser = argparse.ArgumentParser(
        description="Run fine-tuned LLM for academic feedback generation"
    )

    # Model
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Base model ID")
    parser.add_argument("--adapter", default=ADAPTER_DIR,
                        help="Path to LoRA adapter directory")
    parser.add_argument("--base-only", action="store_true",
                        help="Skip LoRA, use base model only")
    parser.add_argument("--device", default="cuda" if torch_available() else "cpu",
                        choices=["cpu", "cuda"])

    # Input sources
    parser.add_argument("--profile", help="JSON file with student profile")
    parser.add_argument("--stdin", action="store_true",
                        help="Read JSON from stdin")
    parser.add_argument("--gender")
    parser.add_argument("--age", type=int)
    parser.add_argument("--study-hours", type=float, dest="study_hours_per_day")
    parser.add_argument("--attendance", type=float, dest="attendance_percent")
    parser.add_argument("--sleep", type=float, dest="sleep_hours")
    parser.add_argument("--gpa", type=float, dest="previous_gpa")
    parser.add_argument("--parental", dest="parental_education")
    parser.add_argument("--internet-access", dest="internet_access")
    parser.add_argument("--extracurricular")
    parser.add_argument("--part-time-job", dest="part_time_job")

    # Generation
    parser.add_argument("--max-tokens", type=int, default=256,
                        help="Maximum generated response length")

    args = parser.parse_args()

    # ── Build profile ────────────────────────────────────────────────────
    if args.stdin and not sys.stdin.isatty():
        profile = json.load(sys.stdin)
    elif args.profile:
        with open(args.profile, encoding="utf-8") as f:
            profile = json.load(f)
    else:
        # Build from CLI args
        profile = {}
        for field in ["gender", "age", "study_hours_per_day", "attendance_percent",
                      "sleep_hours", "previous_gpa", "parental_education",
                      "internet_access", "extracurricular", "part_time_job"]:
            val = getattr(args, field, None)
            if val is not None:
                profile[field] = val

        if not profile:
            print("❌ No profile provided. Use --profile, --stdin, or CLI args.")
            print("   Example: py inference_llm.py --profile student_example.json")
            sys.exit(1)

    print(f" Student Profile: {json.dumps(profile, indent=2)}\n")

    # ── Load model ──────────────────────────────────────────────────────
    print(f" Loading model: {args.model}")
    adapter = None if args.base_only else args.adapter
    model, tokenizer = load_model(args.model, adapter, args.device)

    # ── Generate ────────────────────────────────────────────────────────
    prompt = build_prompt(profile)
    print(" Prompt:\n" + prompt + "\n")
    print("=" * 60)

    response = generate(model, tokenizer, prompt, args.max_tokens, args.device)
    print(response)
    print("\n" + "=" * 60 + "\n✅ Done")


def torch_available():
    """Check if torch with CUDA is available."""
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


if __name__ == "__main__":
    main()