# Segurança

## Camadas aplicadas

1. Login e senha no Supabase Auth.
2. MFA/TOTP obrigatório.
3. Verificação do dispositivo.
4. Aprovação manual do primeiro acesso.
5. RLS em todas as tabelas.
6. Perfil de acesso por usuário.
7. Auditoria de eventos.
8. Projeto Supabase separado.
9. Netlify separado.
10. GitHub separado.

## O que o navegador consegue coletar do dispositivo

Por segurança, o navegador não permite coletar número de série, MAC Address, arquivos, programas instalados ou dados internos da máquina.

O sistema coleta:

- User-Agent.
- Sistema/navegador aproximado.
- Idioma.
- Fuso horário.
- Resolução de tela.
- Hash do perfil do dispositivo.
- IP real se usar Edge Function `register-device`.

## MFA/Authy

O Authy não é vinculado por usuário/senha do Authy. O vínculo acontece por QR Code TOTP.

O QR Code contém uma chave secreta daquele usuário. Depois o Authy gera códigos temporários.

## Passkey / reconhecimento facial

A forma correta é usar WebAuthn/Passkey, que chama a biometria nativa do aparelho:

- Face ID.
- Touch ID.
- Windows Hello.
- Biometria Android.
- Chave física YubiKey.

O projeto já inclui tabelas e Edge Functions base para WebAuthn. Antes de ativar em produção, revisar e testar com o domínio final.

Não é recomendado armazenar foto do rosto no banco.
