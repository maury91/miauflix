import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';

@Controller('ping')
export class HealthController {
  @Get()
  ping(@Res() res: Response) {
    return res.send({ status: 'OK' });
  }
}
