"""Compatibility entry point: rebuild all configured project pages."""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name("inject_all_html.py")), run_name="__main__")
