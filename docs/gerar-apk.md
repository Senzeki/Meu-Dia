# Protocolo de Geração de APK — Meu Dia

> **REGRA FUNDAMENTAL:** NUNCA compilar ou gerar APK por iniciativa própria. Só gerar novo APK quando o usuário pedir explicitamente ("gere o APK", "gerar APK" ou equivalente).

---

## 1. Destino & Nomenclatura (Padrão da Suíte de Apps)
- **Pasta no Google Drive:** `G:\Meu Drive\Programacão\Meu Dia\`
- **Nome do arquivo:** `MeuDia_vX.X.X.apk` (ex: `MeuDia_v0.1.0.apk`)
- **Cópia local (ignorada no Git):** `dist-apk\MeuDia_vX.X.X.apk`
- **Changelog sincronizado:** `log_atualizacoes.txt` na raiz do projeto e copiado automaticamente para `G:\Meu Drive\Programacão\Meu Dia\log_atualizacoes.txt`.

---

## 2. Padrão de Versionamento
- **Versão Inicial:** `0.1.0`
- **Ajustes / Correções:** incremento no terceiro dígito (`0.1.1`, `0.1.2`).
- **Novas telas / Funcionalidades grandes:** incremento no segundo dígito (`0.2.0`, `0.3.0`).
- Ao rodar `.\scripts\gerar-apk.ps1 -Version 0.1.1`, o script atualiza automaticamente `package.json`, `versionName` e incrementa `versionCode` em `android/app/build.gradle`.

---

## 3. Formato do Changelog (`log_atualizacoes.txt`)
Sempre inserir a nova versão no topo do arquivo:
```text
==================================================
Versão: v0.1.0 (DD/MM/AAAA)
==================================================
- [Novidade] Descrição da funcionalidade
- [Melhoria] Descrição da melhoria
- [Correção] O que foi corrigido
==================================================
```

---

## 4. Como Executar
```powershell
npm run apk
# ou especificando nova versão:
powershell -ExecutionPolicy Bypass -File .\scripts\gerar-apk.ps1 -Version 0.1.1
```
