import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AudifonosController } from './audifonos.controller.js';
import { AudifonosService } from './audifonos.service.js';
import { Subscriber, SubscriberSchema } from './schemas/subscriber.schema.js';
import { EmailModule } from '../email/email.module.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Subscriber.name, schema: SubscriberSchema }]), EmailModule],
  controllers: [AudifonosController],
  providers: [AudifonosService],
})
export class AudifonosModule {}
