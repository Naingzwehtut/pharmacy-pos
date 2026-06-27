from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate

from config import Config
from app.models import db

migrate = Migrate()
jwt = JWTManager()


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    CORS(app, origins=app.config["CORS_ORIGINS"], supports_credentials=True)

    from app.routes.auth import auth_bp
    from app.routes.medicines import medicines_bp
    from app.routes.sales import sales_bp
    from app.routes.dashboard import dashboard_bp
    from app.routes.settings import settings_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(medicines_bp, url_prefix="/api/medicines")
    app.register_blueprint(sales_bp, url_prefix="/api/sales")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(settings_bp, url_prefix="/api/settings")

    @app.route("/api/health")
    def health():
        return {"status": "ok"}

    return app
