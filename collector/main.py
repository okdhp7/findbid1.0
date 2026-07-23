import asyncio
import logging
import os

from collector.schedulers import CollectorScheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


async def main() -> None:
    interval = int(os.getenv("COLLECT_INTERVAL_SECONDS", "600"))
    await CollectorScheduler(interval_seconds=interval).run_forever()


if __name__ == "__main__":
    asyncio.run(main())
