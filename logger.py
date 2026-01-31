import logging
import sys
from datetime import datetime


class ColorFormatter(logging.Formatter):
    COLORS = {
        'DEBUG': '\033[36m',     # Cyan
        'INFO': '\033[32m',      # Green
        'WARNING': '\033[33m',   # Yellow
        'ERROR': '\033[31m',     # Red
        'CRITICAL': '\033[35m',  # Magenta
    }
    RESET = '\033[0m'

    def format(self, record):
        color = self.COLORS.get(record.levelname, '')
        record.levelname_colored = f"{color}{record.levelname}{self.RESET}"
        return super().format(record)


def setup_logger(name="kiroku", level=logging.INFO):
    logger = logging.getLogger(name)

    if logger.handlers:
        return logger

    logger.setLevel(level)

    console = logging.StreamHandler(sys.stdout)
    console.setLevel(level)

    fmt = "%(levelname_colored)s %(name)s: %(message)s"
    console.setFormatter(ColorFormatter(fmt))

    logger.addHandler(console)

    return logger


# Logger principal de la aplicación
log = setup_logger(level=logging.DEBUG)


def get_logger(name):
    return logging.getLogger(f"kiroku.{name}")
