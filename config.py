"""App settings. Choose one with the FLASK_CONFIG environment variable (development, production, testing)."""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me")
    DATA_DIR = os.environ.get("PETRIRL_DATA_DIR", os.path.join(BASE_DIR, "data"))    # created at run time
    STOCK_DIR = os.path.join(BASE_DIR, "stock")                                       # shipped instances and agents
    MAX_CONTENT_LENGTH = 64 * 1024 * 1024                                             # uploads (agent .zip)

    TRAIN_MAX_STEPS = 20_000_000
    TRAIN_MAX_ENVS = 8
    DEMO_INSTANCE = "jssp:ft06"                                                      # replay on the home page


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
