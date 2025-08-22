// … no return do MemberDetailsDialog

<DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
  {/* FORÇAR alinhamento à esquerda no header */}
  <DialogHeader className="text-left items-start">
    <DialogTitle className="text-left">
      Detalhes do Titular
      <span className="block text-xs text-gray-500 text-left">
        {(perfil?.nome_completo || member.nome_completo || "—")} ·{" "}
        {(perfil?.email || member.email || "—")} · Tipo de sócio:{" "}
        {(perfil?.tipo_socio || member.tipo_socio || "—")}
      </span>
    </DialogTitle>
  </DialogHeader>

  {/* Wrap para não tocar nas Tabs diretamente (evita TS error) */}
  <div className="text-left">
    <Tabs defaultValue="resumo">
      <TabsList>{/* …como já tens… */}</TabsList>

      {/* Resumo */}
      <TabsContent value="resumo">
        <Card>
          <CardHeader>
            <CardTitle className="text-left">Dados do titular</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6 text-sm text-left">
            {/* …campos… */}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Atletas */}
      <TabsContent value="atletas">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-left">Atletas do titular</CardTitle>
            {/* … */}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* … */}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Documentos */}
      <TabsContent value="docs">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-left">Documentos do Sócio</CardTitle>
              {/* … */}
            </CardHeader>
            {/* … */}
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</DialogContent>
