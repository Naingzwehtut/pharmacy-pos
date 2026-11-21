from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate

from config import Config
from app.models import User, db

migrate = Migrate()
jwt = JWTManager()


@jwt.user_lookup_loader
def _load_user(_header, payload):
    user = db.session.get(User, int(payload["sub"]))
    # A deactivated account is locked out at once, even with a valid token.
    if user is None or user.is_active is False:
        return None
    return user


@jwt.user_lookup_error_loader
def _user_lookup_error(_header, _payload):
    return jsonify({"error": "Your account is not active. Please sign in again."}), 401


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    CORS(app, origins=app.config["CORS_ORIGINS"], supports_credentials=True)

    from app.routes.auth import auth_bp
    from app.routes.credit import credit_bp
    from app.routes.dashboard import dashboard_bp
    from app.routes.medicines import medicines_bp
    from app.routes.patients import patients_bp
    from app.routes.purchases import purchases_bp
    from app.routes.reports import reports_bp
    from app.routes.sales import sales_bp
    from app.routes.settings import settings_bp
    from app.routes.users import users_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(users_bp, url_prefix="/api/users")
    app.register_blueprint(medicines_bp, url_prefix="/api/medicines")
    app.register_blueprint(purchases_bp, url_prefix="/api")
    app.register_blueprint(sales_bp, url_prefix="/api/sales")
    app.register_blueprint(credit_bp, url_prefix="/api/credit")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(reports_bp, url_prefix="/api/reports")
    app.register_blueprint(settings_bp, url_prefix="/api/settings")
    app.register_blueprint(patients_bp, url_prefix="/api/patients")

    @app.errorhandler(413)
    def too_large(_e):
        mb = app.config["MAX_UPLOAD_MB"]
        return {"error": f"File is too large (max {mb} MB)"}, 413

    @app.errorhandler(404)
    def not_found(_e):
        return {"error": "Not found"}, 404

    @app.route("/api/health")
    def health():
        return {"status": "ok", "version": "2.0.0"}

    return app
