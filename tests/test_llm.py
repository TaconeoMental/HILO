#!/usr/bin/env python3
"""
Script para probar y depurar el prompt del LLM.

Uso:
    python3 tests/test_llm.py --file transcripcion.txt
    python3 tests/test_llm.py --file transcripcion.txt --name MATEO
    python3 tests/test_llm.py --file transcripcion.txt --output resultado.md
    echo "hola lol xd" | python3 tests/test_llm.py --stdin
"""

import argparse
import sys
import os

# Asegurar que el directorio raíz esté en el path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import Config
from helpers import load_prompt
from services.llm_service import generate_script
from services.openai_client import get_openai_client


def main():
    parser = argparse.ArgumentParser(
        description="Prueba el LLM con una transcripción"
    )
    parser.add_argument(
        "--file", "-f",
        help="Archivo de transcripción a procesar"
    )
    parser.add_argument(
        "--stdin",
        action="store_true",
        help="Leer transcripción desde stdin"
    )
    parser.add_argument(
        "--name", "-n",
        default="ACTOR",
        help="Nombre del participante (default: ACTOR)"
    )
    parser.add_argument(
        "--output", "-o",
        help="Archivo de salida (default: stdout)"
    )
    parser.add_argument(
        "--show-prompt",
        action="store_true",
        help="Mostrar el prompt del sistema"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Solo mostrar lo que se enviaría al LLM, sin ejecutar"
    )

    args = parser.parse_args()

    if args.show_prompt:
        print("=" * 60)
        print("SYSTEM PROMPT:")
        print("=" * 60)
        print(load_prompt("script_generation"))
        print("=" * 60)
        if not args.file and not args.stdin:
            return

    if args.stdin:
        transcript = sys.stdin.read()
    elif args.file:
        if not os.path.exists(args.file):
            print(f"Error: archivo no encontrado: {args.file}", file=sys.stderr)
            sys.exit(1)
        with open(args.file, "r", encoding="utf-8") as f:
            transcript = f.read()
    else:
        parser.print_help()
        print("\nError: debes especificar --file o --stdin", file=sys.stderr)
        sys.exit(1)

    if not transcript.strip():
        print("Error: transcripción vacía", file=sys.stderr)
        sys.exit(1)

    if args.dry_run:
        print(f"Participante: {args.name}\n\nTranscripción:\n{transcript}")
        return

    if not Config.OPENAI_API_KEY:
        print("Error: OPENAI_API_KEY no configurada en .env", file=sys.stderr)
        sys.exit(1)

    client = get_openai_client()
    if not client:
        print("Error: no se pudo crear cliente OpenAI", file=sys.stderr)
        sys.exit(1)

    print("[INFO] Procesando con LLM...")

    result = generate_script(transcript, args.name)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(result)
        print(f"[INFO] Resultado guardado en: {args.output}")
    else:
        print("\n" + "=" * 60)
        print("RESULTADO:")
        print("=" * 60)
        print(result)


if __name__ == "__main__":
    main()
