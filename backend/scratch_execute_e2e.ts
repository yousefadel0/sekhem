import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { WorkspaceBindingService } from './src/workspace-intelligence/workspace-binding.service';
import { PrismaClient } from '@prisma/client';

async function bootstrap() {
  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst();
  console.log('User:', user?.id);

  if (!user) {
    console.log('No user found.');
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const bindingService = app.get(WorkspaceBindingService);

  // We need the project ID. Let's just find the first project.
  const project = await prisma.project.findFirst();
  console.log('Project:', project?.id);

  if (project) {
    const claims = { sub: user.id, email: user.email, role: 'owner', sessionId: 'test-session', organizationId: 'default' };
    try {
      const binding = await bindingService.resolve(claims as any, project.id);
      console.log('Workspace Binding:', binding);
    } catch (err) {
      console.error('Error resolving binding:', err);
    }
  }

  await app.close();
  await prisma.$disconnect();
}

bootstrap().catch(console.error);
