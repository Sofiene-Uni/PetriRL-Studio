import os

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")     # silence TensorFlow if it is installed (before other imports)
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

from studio import create_app  # noqa: E402

app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, use_reloader=False, threaded=True)
