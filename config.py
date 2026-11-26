"""App settings. Choose one with the FLASK_CONFIG environment variable (development, production, testing)."""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me")
    DATA_DIR = os.environ.get("PETRIRL_DATA_DIR", os.path.join(BASE_DIR, "data"))    # created at run time
    STOCK_DIR = os.path.join(BASE_DIR, "stock")                                       # shipped instances and agents
    # public demo (PETRIRL_PUBLIC=1): no agent uploads (a saved agent is unpickled when loaded, so it could run
    # code), nothing can be deleted or renamed, instance uploads are small and counted
    PUBLIC = os.environ.get("PETRIRL_PUBLIC") == "1"
    MAX_CONTENT_LENGTH = (4 if PUBLIC else 64) * 1024 * 1024                          # uploads (agent .zip)
    PUBLIC_MAX_UPLOADS = 300                                                          # uploaded instances kept

    # public address (canonical links, sitemap)
    SITE_URL = os.environ.get("PETRIRL_SITE_URL", "https://petrirl.de").rstrip("/")
    # who runs the site, shown on the privacy page (required by law in Germany); set on the server, not in the repo
    OPERATOR_NAME = os.environ.get("PETRIRL_OPERATOR_NAME", "Sofiene Lassoued")
    OPERATOR_ADDRESS = os.environ.get("PETRIRL_OPERATOR_ADDRESS", "")
    OPERATOR_EMAIL = os.environ.get("PETRIRL_OPERATOR_EMAIL", "")

    TRAIN_MAX_STEPS = 20_000_000
    TRAIN_MAX_ENVS = 8

    # heavy work (solving, training) waits in one line: COMPUTE_SLOTS jobs at a time, QUEUE_MAX waiting at most
    COMPUTE_SLOTS = int(os.environ.get("PETRIRL_COMPUTE_SLOTS", 1))
    QUEUE_MAX = int(os.environ.get("PETRIRL_QUEUE_MAX", 20))


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


class TestingConfig(Config):
    TESTING = True


config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}
