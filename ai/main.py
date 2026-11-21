import asyncio
import logging
import os
import signal
from concurrent.futures import ThreadPoolExecutor

import grpc

import generate_pb2_grpc
from deepseek import DeepSeekClient, DeepSeekConfig
from summary import IncidentSummaryService

logger = logging.getLogger(__name__)


async def serve():
    port = int(os.environ.get("GRPC_PORT", "50051"))
    if not 1 <= port <= 65535:
        raise ValueError("GRPC_PORT must be between 1 and 65535")

    client = DeepSeekClient(DeepSeekConfig.from_env())
    loop = asyncio.get_running_loop()
    loop.set_default_executor(ThreadPoolExecutor(max_workers=4))
    server = grpc.aio.server(maximum_concurrent_rpcs=8)
    generate_pb2_grpc.add_IncidentSummaryServiceServicer_to_server(
        IncidentSummaryService(client), server
    )
    server.add_insecure_port(f"0.0.0.0:{port}")
    stopping = asyncio.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stopping.set)
    await server.start()
    logger.info("gRPC server listening on port %s", port)
    try:
        await stopping.wait()
    finally:
        logger.info("Stopping gRPC server")
        await server.stop(grace=5)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    asyncio.run(serve())
