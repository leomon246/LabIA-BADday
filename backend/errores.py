"""Errores tipados: permiten distinguir configuración, conectividad, proveedor y validación."""


class ErrorLab(Exception):
    categoria = "interno"


class ErrorConfiguracion(ErrorLab):
    categoria = "configuracion"      # falta clave, modelo mal escrito, variable inválida


class ErrorConectividad(ErrorLab):
    categoria = "conectividad"       # sin red, Ollama apagado, timeout


class ErrorProveedor(ErrorLab):
    categoria = "proveedor"          # HTTP 4xx/5xx, cuota agotada, respuesta vacía/bloqueada


class ErrorValidacion(ErrorLab):
    categoria = "validacion"         # la salida no cumple el contrato
