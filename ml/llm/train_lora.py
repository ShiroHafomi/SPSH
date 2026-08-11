#!/usr/bin/env python3
"""
train_lora.py — QLoRA fine-tune a small LLM for academic feedback generation.

Fine-tunes a 3B–7B parameter model with 4-bit quantization (QLoRA) on the
student profile → feedback dataset produced by prepare_data.py.

Hardware requirements:
    - NVIDIA GPU with 8+ GB VRAM (12+ GB recommended)
    - Or: --device cpu (slow, but works without GPU)

Usage:
    python train_lora.py                          # Default: Llama-3.2-3B, QLoRA 4-bit (train.jsonl + val.jsonl)
    python train_lora.py --model meta-llama/Llama-3.2-3B-Instruct
    python train_lora.py --rank 8 --lora_alpha 16    # Smaller adapter
    python train_lora.py --device cpu              # CPU-only (very slow)
"""

import argparse
import json
import os
import sys

# ── Constants ────────────────────────────────────────────────────────────────
DEFAULT_MODEL = "meta-llama/Llama-3.2-3B-Instruct"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "checkpoints")
ADAPTER_DIR = os.path.join(os.path.dirname(__file__), "adapter")


def get_training_config(args):
    """Return model, tokenizer, LoRA, and training argument configs."""
    import torch
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        TrainingArguments,
        BitsAndBytesConfig,
    )
    from peft import LoraConfig, get_peft_model, TaskType, prepare_model_for_kbit_training

    # ── Quantization (QLoRA) ──────────────────────────────────────────────
    use_cuda = args.device == "cuda" and torch.cuda.is_available()
    use_bf16 = use_cuda and getattr(torch.cuda, "is_bf16_supported", lambda: False)()

    if args.device == "cpu":
        bnb_config = None
        torch_dtype = torch.float32
        print("  Running on CPU — no quantization (expect very slow training)")
    else:
        compute_dtype = torch.bfloat16 if use_bf16 else torch.float16
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=compute_dtype,
            bnb_4bit_use_double_quant=True,
        )
        torch_dtype = compute_dtype

    # ── Tokenizer ─────────────────────────────────────────────────────────
    tokenizer = AutoTokenizer.from_pretrained(
        args.model, trust_remote_code=args.trust_remote_code
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # ── Model ─────────────────────────────────────────────────────────────
    model_kwargs = {
        "torch_dtype": torch_dtype,
        "trust_remote_code": args.trust_remote_code,
    }
    if bnb_config:
        model_kwargs["quantization_config"] = bnb_config

    if args.device == "cpu":
        model_kwargs["device_map"] = "cpu"
    else:
        model_kwargs["device_map"] = "auto"

    model = AutoModelForCausalLM.from_pretrained(args.model, **model_kwargs)

    # Prepare for LoRA
    if bnb_config:
        model = prepare_model_for_kbit_training(model)

    # ── LoRA Config ───────────────────────────────────────────────────────
    target_modules = [module.strip() for module in args.target_modules.split(",") if module.strip()]
    available_module_names = {
        name.rsplit(".", 1)[-1]
        for name, _ in model.named_modules()
    }
    missing_modules = [module for module in target_modules if module not in available_module_names]
    if missing_modules:
        print(f" Target module(s) not found in model: {', '.join(missing_modules)}")
        sys.exit(1)

    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=args.rank,
        lora_alpha=args.lora_alpha,
        target_modules=target_modules,
        lora_dropout=args.lora_dropout,
        bias="none",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # ── Training Arguments ────────────────────────────────────────────────
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation,
        learning_rate=args.learning_rate,
        lr_scheduler_type="cosine",
        warmup_ratio=args.warmup_ratio,
        weight_decay=args.weight_decay,
        fp16=use_cuda and not use_bf16,
        bf16=use_bf16,
        logging_steps=args.logging_steps,
        evaluation_strategy="steps",
        save_strategy="steps",
        eval_steps=args.eval_steps,
        save_steps=args.save_steps,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        save_total_limit=2,
        report_to="none",
        disable_tqdm=False,
    )

    return model, tokenizer, training_args


def main():
    parser = argparse.ArgumentParser(
        description="QLoRA fine-tune LLM for academic feedback generation"
    )

    # Model
    parser.add_argument("--model", default=DEFAULT_MODEL,
                        help="Base model ID from Hugging Face Hub")
    parser.add_argument("--trust-remote-code", action="store_true",
                        help="Allow custom model code")

    # LoRA
    parser.add_argument("--rank", type=int, default=16, help="LoRA rank r")
    parser.add_argument("--lora-alpha", type=int, default=32, help="LoRA alpha")
    parser.add_argument("--lora-dropout", type=float, default=0.05, help="LoRA dropout")
    parser.add_argument("--target-modules", default="q_proj,v_proj",
                        help="Comma-separated target module names")

    # Training
    parser.add_argument("--epochs", type=int, default=3, help="Training epochs")
    parser.add_argument("--batch-size", type=int, default=2, help="Per-device batch size")
    parser.add_argument("--gradient-accumulation", type=int, default=4,
                        help="Gradient accumulation steps")
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--warmup-ratio", type=float, default=0.03)
    parser.add_argument("--weight-decay", type=float, default=0.01)

    # Logging
    parser.add_argument("--logging-steps", type=int, default=10)
    parser.add_argument("--eval-steps", type=int, default=50)
    parser.add_argument("--save-steps", type=int, default=100)

    # Data
    parser.add_argument("--train-file", default=os.path.join(os.path.dirname(__file__), "data", "train.jsonl"))
    parser.add_argument("--val-file", default=os.path.join(os.path.dirname(__file__), "data", "val.jsonl"))

    # Device
    parser.add_argument("--max-seq-len", type=int, default=2048,
                        help="Maximum sequence length")
    parser.add_argument("--device", default="cuda" if torch_is_available() else "cpu",
                        choices=["cpu", "cuda"],
                        help="Device to train on")

    args = parser.parse_args()

    if args.device == "cuda" and not torch_is_available():
        print(" CUDA was requested, but no CUDA-capable PyTorch device is available.")
        sys.exit(1)

    # ── Validate data ─────────────────────────────────────────────────────
    if not os.path.isfile(args.train_file):
        print(f" Training file not found: {args.train_file}")
        print("   Run `python prepare_data.py` first to generate the dataset.")
        sys.exit(1)

    if not os.path.isfile(args.val_file):
        print(f" Validation file not found: {args.val_file}")
        print("   Run `python prepare_data.py` first to generate the train/val split.")
        sys.exit(1)

    if os.path.abspath(args.train_file) == os.path.abspath(args.val_file):
        print(" Training and validation files must be different.")
        sys.exit(1)

    with open(args.train_file, encoding="utf-8") as f:
        train_count = sum(1 for _ in f)
    with open(args.val_file, encoding="utf-8") as f:
        val_count = sum(1 for _ in f)

    if train_count == 0 or val_count == 0:
        print(" Training and validation files must each contain at least one example.")
        sys.exit(1)

    print(f" Training examples: {train_count}")
    print(f" Validation examples: {val_count}")

    # ── Validate target_modules against model ────────────────────────────
    print(f"\n Loading model: {args.model}")
    print(f"   LoRA: rank={args.rank}, alpha={args.lora_alpha}, dropout={args.lora_dropout}")
    print(f"   Device: {args.device}")
    print(f"   Epochs: {args.epochs}, batch_size={args.batch_size}, grad_accum={args.gradient_accumulation}")
    print(f"   Effective batch size: {args.batch_size * args.gradient_accumulation}")

    model, tokenizer, training_args = get_training_config(args)

    # ── Load dataset ──────────────────────────────────────────────────────
    from datasets import load_dataset

    dataset = load_dataset("json", data_files={
        "train": args.train_file,
        "eval": args.val_file,
    })

    def format_prompt(example):
        """Alpaca-style instruction → response format."""
        return {
            "text": (
                f"### Instruction:\n{example['instruction']}\n\n"
                f"### Response:\n{example['output']}"
            )
        }

    dataset = dataset.map(format_prompt, desc="Formatting prompts")

    # ── Train ────────────────────────────────────────────────────────
    from trl import SFTTrainer

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset["train"],
        eval_dataset=dataset["eval"],
        dataset_text_field="text",
        max_seq_length=args.max_seq_len,
    )

    print("\n Starting training...")
    trainer.train()

    # ── Save adapter ─────────────────────────────────────────────────
    os.makedirs(ADAPTER_DIR, exist_ok=True)
    model.save_pretrained(ADAPTER_DIR)
    tokenizer.save_pretrained(ADAPTER_DIR)

    # ── Save training config ──────────────────────────────────────────
    config = {
        "model": args.model,
        "rank": args.rank,
        "lora_alpha": args.lora_alpha,
        "target_modules": args.target_modules.split(","),
        "epochs": args.epochs,
        "learning_rate": args.learning_rate,
        "training_examples": train_count,
    }
    with open(os.path.join(ADAPTER_DIR, "training_config.json"), "w") as f:
        json.dump(config, f, indent=2)

    print(f"\n Adapter saved to: {ADAPTER_DIR}")
    print(f"   Next step: python inference_llm.py --profile student.json")


def torch_is_available():
    """Check if torch with CUDA is available (import-safe)."""
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


if __name__ == "__main__":
    main()