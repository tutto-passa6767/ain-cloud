'use strict';
// Назначение роли сотрудника: node prisma/make-staff.js email ADMIN|MODERATOR|SUPPORT|ACCOUNTANT
// Пользователь должен быть зарегистрирован. При первом входе в админ-панель он включит 2FA (обязательно для сотрудников).
const { PrismaClient } = require('@prisma/client');

async function main() {
  const [email, role = 'ADMIN'] = process.argv.slice(2);
  if (!email || !['ADMIN', 'MODERATOR', 'SUPPORT', 'ACCOUNTANT', 'USER'].includes(role)) {
    console.error('Использование: npm run staff -w @ain/db -- <email> <ADMIN|MODERATOR|SUPPORT|ACCOUNTANT|USER>');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.update({ where: { email: email.toLowerCase() }, data: { role } });
    await prisma.auditEvent.create({ data: { action: 'admin.role_assigned_cli', targetType: 'user', targetId: user.id, meta: { role } } });
    console.log(`${user.email}: роль ${role}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
