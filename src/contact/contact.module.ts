import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContactController } from './contact.controller.js';
import { ContactService } from './contact.service.js';
import { Contact, ContactSchema } from './schemas/contact.schema.js';
import { EmailModule } from '../email/email.module.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Contact.name, schema: ContactSchema }]), EmailModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
