# 🟢 Rise WhatsApp v2.0

Sistema completo de disparos WhatsApp via **Evolution API** com banco de dados **Neon (PostgreSQL)** hospedado na **Vercel**.

---

## 📁 Estrutura do Projeto

```
rise-whatsapp/
├── index.html          ← App principal (SPA completo)
├── api/
│   └── dados.js        ← Serverless function: persistência no Neon
├── package.json
├── vercel.json
└── README.md
```

---

## 🚀 Deploy na Vercel

### 1. Criar repositório no GitHub
```bash
git init
git add .
git commit -m "Rise WhatsApp v2.0"
git remote add origin https://github.com/SEU_USUARIO/rise-whatsapp.git
git push -u origin main
```

### 2. Importar na Vercel
1. Acesse [vercel.com](https://vercel.com)
2. **New Project** → importe o repositório
3. Framework: **Other** (sem framework)
4. Clique em **Deploy**

### 3. Variáveis de Ambiente (OBRIGATÓRIO)
Na Vercel: **Settings → Environment Variables**

```
DATABASE_URL = postgresql://user:password@host.neon.tech/dbname?sslmode=require
```

> Cole a connection string do **Neon Console** → seu projeto → Connection string

### 4. Domínio personalizado (opcional)
Settings → Domains → Add domain

---

## ⚙️ Configuração no App

Após o deploy, acesse a URL e:
1. Faça login (senha padrão: `rise123`)
2. Vá em **Configurações**
3. Preencha:
   - **URL da API**: `https://sua-api.dominio.com` (VPS Hostinger)
   - **API Key**: sua chave da Evolution API
   - **Nome da Instância**: nome da instância configurada

---

## 🔐 Usuários Padrão

| Login | Senha | Perfil |
|-------|-------|--------|
| gustavoc | rise123 | Master |
| giuliab | rise123 | Usuário |
| larissap | rise123 | Usuário |

> ⚠️ **Altere as senhas** após o primeiro login em Configurações → Usuários.

---

## 📦 Recursos

- ✅ **Contatos**: Importação via Excel/CSV, adição manual, filtros avançados, paginação
- ✅ **Conversas**: Histórico por contato, envio direto clicando no número
- ✅ **Mensagens**: Templates salvos, variáveis dinâmicas ({nome}, {empresa}, etc.)
- ✅ **Disparos**: Com intervalo aleatório configurável, barra de progresso em tempo real
- ✅ **Agendamentos**: Programe disparos para data/hora específica
- ✅ **Listas**: Organize contatos em grupos, disparo por lista
- ✅ **CRM**: Kanban visual com 5 colunas, anotações, exportação
- ✅ **Relatório**: Log completo de envios com exportação CSV
- ✅ **Multi-usuário**: Login com senhas por usuário
- ✅ **Banco Neon**: Dados persistidos no PostgreSQL via Vercel Serverless
- ✅ **Responsivo**: Funciona em celular e tablet

---

## 🛠️ Evolution API na VPS Hostinger

Certifique-se que sua VPS tem:
- Docker instalado
- Evolution API rodando (porta 8080 ou 443)
- HTTPS configurado (Let's Encrypt / Nginx)
- CORS liberado para `*.vercel.app`

Exemplo de configuração Nginx:
```nginx
location / {
    proxy_pass http://localhost:8080;
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Headers "apikey, Content-Type";
}
```

---

## 🗄️ Banco Neon

A tabela `rise_dados` é criada automaticamente na primeira requisição.

Estrutura:
```sql
rise_dados (
  id, user_key, contacts, listas, logs, crm,
  fila, agendamentos, savedmsg, config, updated_at
)
```

Cada usuário tem seus próprios dados isolados pelo `user_key`.
