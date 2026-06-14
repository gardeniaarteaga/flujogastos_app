import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { LoginUsuarioDto } from './dto/login-usuario.dto';
import { RegisterUsuarioDto } from './dto/register-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  create(
    @Body() createUsuarioDto: CreateUsuarioDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.usuariosService.create(createUsuarioDto, this.parseIdUsuario(idUsuario));
  }

  @Post('login')
  login(@Body() loginUsuarioDto: LoginUsuarioDto) {
    return this.usuariosService.login(loginUsuarioDto);
  }

  @Post('register')
  register(@Body() registerUsuarioDto: RegisterUsuarioDto) {
    return this.usuariosService.register(registerUsuarioDto);
  }

  @Get()
  findAll(@Query('id_usuario') idUsuario?: string) {
    return this.usuariosService.findAll(this.parseIdUsuario(idUsuario));
  }

  @Get('resolve')
  resolveByUsername(@Query('username') username?: string) {
    if (!username?.trim()) {
      throw new BadRequestException('Debes enviar el username del usuario');
    }

    return this.usuariosService.resolveByUsername(username);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.usuariosService.findOne(id, this.parseIdUsuario(idUsuario));
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUsuarioDto: UpdateUsuarioDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.usuariosService.update(
      id,
      updateUsuarioDto,
      this.parseIdUsuario(idUsuario),
    );
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.usuariosService.remove(id, this.parseIdUsuario(idUsuario));
  }

  private parseIdUsuario(idUsuario?: string): number {
    if (idUsuario === undefined || idUsuario.trim() === '') {
      return 1;
    }

    const parsedValue = Number(idUsuario);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      throw new BadRequestException('El id_usuario debe ser un entero positivo');
    }

    return parsedValue;
  }
}
