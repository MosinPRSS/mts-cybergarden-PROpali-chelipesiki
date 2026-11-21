"""Regenerate the backend gRPC client after editing proto/generate.proto."""

from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
destination = root / "backend" / "ai_proto"
destination.mkdir(exist_ok=True)
(destination / "__init__.py").touch()
subprocess.run([
    sys.executable, "-m", "grpc_tools.protoc", "-I", str(root / "proto"),
    f"--python_out={destination}", f"--grpc_python_out={destination}",
    str(root / "proto" / "generate.proto"),
], check=True)
client = destination / "generate_pb2_grpc.py"
client.write_text(client.read_text().replace(
    "import generate_pb2 as generate__pb2", "from . import generate_pb2 as generate__pb2"
))
