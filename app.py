import os
import json
import click

from flask import Flask

from config import Config
from extensions import init_extensions, login_manager, Session
from routes import register_blueprints
from models import User
from services import project_store


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    init_extensions(app)

    @login_manager.user_loader
    def load_user(user_id):
        db = Session()
        try:
            user = db.query(User).filter_by(id=user_id, is_active=True).first()
            return user
        finally:
            Session.remove()

    register_blueprints(app)

    # Comandos CLI
    register_cli(app)

    os.makedirs(Config.DATA_DIR, exist_ok=True)
    os.makedirs(os.path.join(Config.DATA_DIR, "projects"), exist_ok=True)

    return app


def register_cli(app):
    @app.cli.command("create-admin")
    @click.option("--username", prompt=True, help="Admin username")
    @click.option(
        "--password",
        prompt=True,
        hide_input=True,
        confirmation_prompt=True,
        help="Admin password"
    )
    def create_admin(username, password):
        db = Session()

        try:
            existing = db.query(User).filter_by(username=username).first()
            if existing:
                click.echo(f"Error: User '{username}' already exists.")
                return

            user = User(
                username=username,
                is_admin=True,
                is_active=True,
                must_change_password=False,
                can_stylize_images=True
            )
            user.set_password(password)

            db.add(user)
            db.commit()

            click.echo(f"Admin user '{username}' created successfully.")
        finally:
            Session.remove()

    @app.cli.command("export-project")
    @click.argument("project_id")
    @click.option("--output", "output_path", type=click.Path(), help="Archivo de salida opcional")
    def export_project(project_id, output_path):
        """Exporta el estado del proyecto a JSON."""
        data = project_store.export_project_state(project_id)
        if not data:
            click.echo("Proyecto no encontrado", err=True)
            return
        payload = json.dumps(data, indent=2, ensure_ascii=False)
        if output_path:
            with open(output_path, "w", encoding="utf-8") as fh:
                fh.write(payload)
            click.echo(f"Estado exportado a {output_path}")
        else:
            click.echo(payload)

app = create_app()


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=8000)
