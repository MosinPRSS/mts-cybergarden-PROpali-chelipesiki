import os
import sys

import grpc


def main():
    port = os.environ.get("GRPC_PORT", "50051")
    with grpc.insecure_channel(f"127.0.0.1:{port}") as channel:
        try:
            grpc.channel_ready_future(channel).result(timeout=3)
        except grpc.FutureTimeoutError:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
