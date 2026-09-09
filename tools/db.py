"""Connection settings for the SMP database.

The auction house used to keep its state in a SQLite file that the deploy
workflow copied off the game server over SFTP. It now writes to MySQL, so the
build reads the live database directly and there is no file to fetch, verify or
go stale.

Settings come from the environment first and `local.env` second, so CI passes
repository secrets and a developer machine keeps a file that is gitignored:

    DB_HOST  DB_PORT  DB_NAME  DB_USER  DB_PASSWORD

`local.env` is the `database:` block of the plugin's own config, pasted
verbatim - indented `key: value` lines, values optionally quoted:

    host: db.example.com
    port: 3306
    database: s0000_SMPdb
    username: u0000_xxxxxxxx
    password: 'secret'
"""

import os
import re

import pymysql
from pymysql.cursors import SSDictCursor

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(os.path.dirname(HERE), "local.env")

# Plugin config key -> environment variable holding the same value in CI.
KEYS = {
    "host": "DB_HOST",
    "port": "DB_PORT",
    "database": "DB_NAME",
    "username": "DB_USER",
    "password": "DB_PASSWORD",
}

_LINE = re.compile(r"^\s*([A-Za-z_]+)\s*:\s*(.*?)\s*$")


def read_env_file(path=ENV_FILE):
    if not os.path.exists(path):
        return {}
    settings = {}
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            if line.lstrip().startswith("#"):
                continue
            match = _LINE.match(line)
            if match:
                settings[match.group(1)] = match.group(2).strip("'\"")
    return settings


def settings():
    """Resolved connection settings, or a KeyError naming what is missing."""
    from_file = read_env_file()
    resolved = {}
    for key, variable in KEYS.items():
        value = os.environ.get(variable) or from_file.get(key)
        if not value:
            raise KeyError(
                f"no database {key}: set {variable} in the environment, "
                f"or `{key}:` in {ENV_FILE}"
            )
        resolved[key] = value
    return resolved


def connect():
    """A read-only connection. The build only ever selects, and the session is
    pinned read-only so a mistake here cannot write to a live game database."""
    config = settings()
    connection = pymysql.connect(
        host=config["host"],
        port=int(config["port"]),
        user=config["username"],
        password=config["password"],
        database=config["database"],
        # The `parameters:` line in the plugin config is a JDBC query string;
        # its useSSL/characterEncoding settings are PyMySQL defaults or set
        # here, so nothing there needs parsing.
        charset="utf8mb4",
        connect_timeout=30,
        read_timeout=180,
        autocommit=True,
    )
    with connection.cursor() as cursor:
        cursor.execute("SET SESSION TRANSACTION READ ONLY")
    return connection


def rows(connection, sql, args=None):
    """Stream a result set as dicts.

    Listings carry a serialized item blob each, so the auction table is tens of
    megabytes. Streaming keeps it out of memory all at once and lets decoding
    start on the first row rather than the last.
    """
    with connection.cursor(SSDictCursor) as cursor:
        cursor.execute(sql, args)
        for row in cursor:
            yield row


def all_rows(connection, sql, args=None):
    """Buffered variant, for the small tables where streaming buys nothing."""
    with connection.cursor(pymysql.cursors.DictCursor) as cursor:
        cursor.execute(sql, args)
        return cursor.fetchall()
