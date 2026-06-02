use std::sync::Arc;

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, DigitallySignedStruct, SignatureScheme};
use tokio_postgres::{Client, Config, NoTls};
use tokio_postgres_rustls::MakeRustlsConnect;

use crate::types::ConnectionProfile;

/// ServerCertVerifier que acepta cualquier cert sin validar la cadena ni el hostname.
/// Equivalente a `sslmode=require` de libpq: cifra el canal pero no autentica al servidor.
/// Es lo mismo que hace la app Python (psycopg2 con sslmode=require) — sin esto, los
/// providers managed con CAs internas (Aiven, RDS, Supabase) fallan con UnknownIssuer.
#[derive(Debug)]
struct AcceptAnyCert;

impl ServerCertVerifier for AcceptAnyCert {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        vec![
            SignatureScheme::RSA_PKCS1_SHA256,
            SignatureScheme::RSA_PKCS1_SHA384,
            SignatureScheme::RSA_PKCS1_SHA512,
            SignatureScheme::ECDSA_NISTP256_SHA256,
            SignatureScheme::ECDSA_NISTP384_SHA384,
            SignatureScheme::ECDSA_NISTP521_SHA512,
            SignatureScheme::RSA_PSS_SHA256,
            SignatureScheme::RSA_PSS_SHA384,
            SignatureScheme::RSA_PSS_SHA512,
            SignatureScheme::ED25519,
        ]
    }
}

fn build_pg_config_with_db(profile: &ConnectionProfile, dbname: &str) -> Config {
    let mut cfg = Config::new();
    cfg.host(&profile.host)
        .port(profile.port)
        .user(&profile.user)
        .password(&profile.password)
        .dbname(dbname)
        .application_name("app-clone-db")
        .connect_timeout(std::time::Duration::from_secs(30));
    cfg
}

fn build_tls() -> MakeRustlsConnect {
    let config = ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(AcceptAnyCert))
        .with_no_client_auth();

    MakeRustlsConnect::new(config)
}

/// Construye un mensaje de error detallado que recorre la cadena de causas.
/// Importante porque rustls anida errores (`InvalidCertificate(NotValidForName)`,
/// etc.) y el `Display` del top-level solo dice "tls handshake".
fn format_tls_error(err: &tokio_postgres::Error, host: &str, port: u16) -> String {
    let mut parts = vec![format!("{}", err)];
    let mut source: Option<&dyn std::error::Error> = std::error::Error::source(err);
    while let Some(s) = source {
        parts.push(format!("{}", s));
        source = s.source();
    }
    format!(
        "TLS connection to {}:{} failed — {}",
        host,
        port,
        parts.join(" → ")
    )
}

/// Conecta a la BD con SSL si el perfil lo requiere.
/// La conexión devuelve un `Client`; la tarea de driver corre en background.
pub async fn connect(profile: &ConnectionProfile) -> Result<Client, String> {
    connect_to_db(profile, &profile.database).await
}

/// Igual que `connect` pero permite override del dbname (útil para conectar a `postgres`
/// y poder hacer DROP/CREATE DATABASE).
pub async fn connect_to_db(profile: &ConnectionProfile, dbname: &str) -> Result<Client, String> {
    if profile.ssl {
        // Asegura que el provider de crypto está instalado (idempotente).
        let _ = rustls::crypto::ring::default_provider().install_default();

        let cfg = build_pg_config_with_db(profile, dbname);
        let tls = build_tls();
        let (client, connection) = cfg
            .connect(tls)
            .await
            .map_err(|e| format_tls_error(&e, &profile.host, profile.port))?;
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("postgres connection error: {}", e);
            }
        });
        Ok(client)
    } else {
        let cfg = build_pg_config_with_db(profile, dbname);
        let (client, connection) = cfg
            .connect(NoTls)
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("postgres connection error: {}", e);
            }
        });
        Ok(client)
    }
}

