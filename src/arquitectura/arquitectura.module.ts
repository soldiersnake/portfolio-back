import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ArquitecturaContact, ArquitecturaContactSchema } from './schemas/contact.schema.js';
import { ArquitecturaContactService } from './contact/contact.service.js';
import { ArquitecturaContactController } from './contact/contact.controller.js';
import { EmailModule } from '../email/email.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ArquitecturaContact.name, schema: ArquitecturaContactSchema }]),
    EmailModule,
  ],
  controllers: [ArquitecturaContactController],
  providers: [ArquitecturaContactService],
})
export class ArquitecturaModule {}
