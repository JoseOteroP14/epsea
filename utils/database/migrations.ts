import type { SQLiteDatabase } from "expo-sqlite";

interface Migration {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
}

const migrations: Migration[] = [
  {
    version: 1,
    up: async (db) => {
      await db.execAsync(`
        -- Auth
        CREATE TABLE IF NOT EXISTS users (
          user_id INTEGER PRIMARY KEY,
          username TEXT NOT NULL,
          roles_json TEXT NOT NULL DEFAULT '[]'
        );

        -- Projects
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          type_id INTEGER,
          role_name TEXT,
          raw_json TEXT NOT NULL
        );

        -- Producers
        CREATE TABLE IF NOT EXISTS producers (
          id INTEGER PRIMARY KEY,
          project_id INTEGER NOT NULL,
          identification TEXT NOT NULL,
          first_name TEXT NOT NULL,
          middle_name TEXT,
          first_surname TEXT NOT NULL,
          last_surname TEXT,
          email TEXT,
          phone TEXT,
          raw_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_producers_project_id ON producers(project_id);

        -- Producer details
        CREATE TABLE IF NOT EXISTS producer_details (
          id INTEGER PRIMARY KEY,
          raw_json TEXT NOT NULL
        );

        -- Survey components
        CREATE TABLE IF NOT EXISTS components (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          raw_json TEXT NOT NULL
        );

        -- Question types
        CREATE TABLE IF NOT EXISTS question_types (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        );

        -- Questions
        CREATE TABLE IF NOT EXISTS questions (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          component_id INTEGER NOT NULL,
          question_type_id INTEGER NOT NULL,
          is_required INTEGER DEFAULT 0,
          sort_order INTEGER DEFAULT 0,
          raw_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_questions_component_id ON questions(component_id);

        -- Question details (type-specific)
        CREATE TABLE IF NOT EXISTS question_details (
          question_id INTEGER PRIMARY KEY,
          type_name TEXT NOT NULL,
          raw_json TEXT NOT NULL
        );

        -- Innova fields
        CREATE TABLE IF NOT EXISTS innova_fields (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          field_type TEXT,
          raw_json TEXT NOT NULL
        );

        -- Survey answers (offline writes)
        CREATE TABLE IF NOT EXISTS survey_answers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          producer_id INTEGER NOT NULL,
          project_id INTEGER NOT NULL,
          component_id INTEGER NOT NULL,
          question_id INTEGER NOT NULL,
          value TEXT,
          answered_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(producer_id, project_id, component_id, question_id)
        );

        CREATE INDEX IF NOT EXISTS idx_survey_answers_producer ON survey_answers(producer_id, project_id);

        -- Sync queue
        CREATE TABLE IF NOT EXISTS sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_key TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);

        -- Prevent duplicate sync queue entries for same entity (UPSERT semantics)
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_entity_key
          ON sync_queue(entity_type, entity_key);

        -- Sync metadata
        CREATE TABLE IF NOT EXISTS sync_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Migrations tracking
        CREATE TABLE IF NOT EXISTS _migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL UNIQUE,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    version: 2,
    up: async (db) => {
      // Add user_id to survey_answers to track which extensionist created each answer
      await db.execAsync(`
        ALTER TABLE survey_answers ADD COLUMN user_id INTEGER;
      `);

      // Add user_id to sync_queue to track which extensionist queued each item
      await db.execAsync(`
        ALTER TABLE sync_queue ADD COLUMN user_id INTEGER;
      `);

      // Create index for faster filtering by user
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_survey_answers_user ON survey_answers(user_id);
        CREATE INDEX IF NOT EXISTS idx_sync_queue_user ON sync_queue(user_id);
      `);

      // Update unique constraint for survey_answers to include user_id
      // SQLite doesn't support ALTER CONSTRAINT, so we recreate the table
      await db.execAsync(`
        CREATE TABLE survey_answers_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          producer_id INTEGER NOT NULL,
          project_id INTEGER NOT NULL,
          component_id INTEGER NOT NULL,
          question_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          value TEXT,
          answered_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(producer_id, project_id, component_id, question_id, user_id)
        );

        INSERT INTO survey_answers_new (id, producer_id, project_id, component_id, question_id, user_id, value, answered_at)
        SELECT id, producer_id, project_id, component_id, question_id, COALESCE(user_id, 0), value, answered_at
        FROM survey_answers;

        DROP TABLE survey_answers;
        ALTER TABLE survey_answers_new RENAME TO survey_answers;

        CREATE INDEX IF NOT EXISTS idx_survey_answers_producer ON survey_answers(producer_id, project_id);
        CREATE INDEX IF NOT EXISTS idx_survey_answers_user ON survey_answers(user_id);
      `);
    },
  },
  {
    version: 3,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS productive_lines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          producer_id INTEGER NOT NULL,
          project_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          line_type TEXT NOT NULL,
          line_count INTEGER NOT NULL DEFAULT 0,
          lines_data TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(producer_id, project_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_productive_lines_producer ON productive_lines(producer_id, project_id);
      `);
    },
  },
  {
    version: 4,
    up: async (db) => {
      const columns = await db.getAllAsync<{ name: string }>(
        "PRAGMA table_info(users);",
      );
      const hasFirstName = columns.some((c) => c.name === "first_name");
      const hasLastName = columns.some((c) => c.name === "last_name");

      if (!hasFirstName) {
        await db.execAsync(`
          ALTER TABLE users ADD COLUMN first_name TEXT;
        `);
      }

      if (!hasLastName) {
        await db.execAsync(`
          ALTER TABLE users ADD COLUMN last_name TEXT;
        `);
      }
    },
  },
{
    version: 5,
    up: async (db) => {
      await db.execAsync(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_entity_key
          ON sync_queue(entity_type, entity_key);
      `);
    },
  },
  {
    version: 6,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS answer_updates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          answer_id INTEGER NOT NULL,
          new_value TEXT NOT NULL,
          producer_id INTEGER NOT NULL,
          project_id INTEGER NOT NULL,
          component_id INTEGER NOT NULL,
          question_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          intervention_method_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(answer_id)
        );

        CREATE INDEX IF NOT EXISTS idx_answer_updates_user
          ON answer_updates(user_id);

        CREATE TABLE IF NOT EXISTS visit1_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          visit_uuid TEXT NOT NULL UNIQUE,
          payload TEXT NOT NULL,
          photos TEXT NOT NULL DEFAULT '[]',
          user_id INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_visit1_queue_status ON visit1_queue(status);
        CREATE INDEX IF NOT EXISTS idx_visit1_queue_user ON visit1_queue(user_id);
      `);
    },
  },
  {
    version: 7,
    up: async (db) => {
      await db.execAsync(`
        ALTER TABLE survey_answers ADD COLUMN local_modified_at TEXT;
      `);
    },
  },
  {
    version: 8,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS producer_intervention_methods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          producer_id INTEGER NOT NULL,
          project_id INTEGER NOT NULL,
          intervention_method_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          applied_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(producer_id, project_id, intervention_method_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_pim_producer
          ON producer_intervention_methods(producer_id, project_id);

        CREATE INDEX IF NOT EXISTS idx_pim_user
          ON producer_intervention_methods(user_id);
      `);
    },
  },
  {
    version: 9,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS survey_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          survey_id INTEGER NOT NULL DEFAULT 0,
          answer_id INTEGER NOT NULL UNIQUE,
          question_id INTEGER NOT NULL,
          answer_value TEXT NOT NULL DEFAULT '',
          question_description TEXT,
          question_type_id INTEGER NOT NULL DEFAULT 0,
          question_parent_id INTEGER,
          intervention_method_id INTEGER NOT NULL,
          producer_id INTEGER NOT NULL,
          project_id INTEGER NOT NULL,
          created_at TEXT,
          updated_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_survey_results_lookup
          ON survey_results(producer_id, project_id, intervention_method_id);
      `);
    },
  },
  {
    version: 10,
    up: async (db) => {
      await db.execAsync(`
        -- Ensure sync_metadata exists (was added to v1 after initial release)
        CREATE TABLE IF NOT EXISTS sync_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    version: 11,
    up: async (db) => {
      // Add item_name to survey_results
      const srCols = await db.getAllAsync<{name:string}>('PRAGMA table_info(survey_results);');
      if (!srCols.some(c => c.name === 'item_name')) {
        await db.execAsync('ALTER TABLE survey_results ADD COLUMN item_name TEXT;');
      }

      // Static municipalities table
      await db.execAsync(`CREATE TABLE IF NOT EXISTS static_municipalities (
        department_cod TEXT NOT NULL,
        department TEXT NOT NULL,
        municipality_code TEXT NOT NULL,
        municipality TEXT NOT NULL,
        PRIMARY KEY (department_cod, municipality_code)
      );`);

      // Seed static data
      await db.execAsync(`INSERT OR IGNORE INTO static_municipalities (department_cod,department,municipality_code,municipality) VALUES ('91','AMAZONAS','91263','EL ENCANTO'),('91','AMAZONAS','91405','LA CHORRERA'),('91','AMAZONAS','91407','LA PEDRERA'),('91','AMAZONAS','91430','LA VICTORIA'),('91','AMAZONAS','91001','LETICIA'),('91','AMAZONAS','91460','MIRITÍ - PARANÁ'),('91','AMAZONAS','91530','PUERTO ALEGRÍA'),('91','AMAZONAS','91536','PUERTO ARICA'),('91','AMAZONAS','91540','PUERTO NARIÑO'),('91','AMAZONAS','91669','PUERTO SANTANDER'),('91','AMAZONAS','91798','TARAPACÁ'),('05','ANTIOQUIA','05002','ABEJORRAL'),('05','ANTIOQUIA','05004','ABRIAQUÍ'),('05','ANTIOQUIA','05021','ALEJANDRÍA'),('05','ANTIOQUIA','05030','AMAGÁ'),('05','ANTIOQUIA','05031','AMALFI'),('05','ANTIOQUIA','05034','ANDES'),('05','ANTIOQUIA','05036','ANGELÓPOLIS'),('05','ANTIOQUIA','05038','ANGOSTURA'),('05','ANTIOQUIA','05040','ANORÍ'),('05','ANTIOQUIA','05044','ANZÁ'),('05','ANTIOQUIA','05045','APARTADÓ'),('05','ANTIOQUIA','05051','ARBOLETES'),('05','ANTIOQUIA','05055','ARGELIA'),('05','ANTIOQUIA','05059','ARMENIA'),('05','ANTIOQUIA','05079','BARBOSA'),('05','ANTIOQUIA','05088','BELLO'),('05','ANTIOQUIA','05086','BELMIRA'),('05','ANTIOQUIA','05091','BETANIA'),('05','ANTIOQUIA','05093','BETULIA'),('05','ANTIOQUIA','05107','BRICEÑO'),('05','ANTIOQUIA','05113','BURITICÁ'),('05','ANTIOQUIA','05120','CÁCERES'),('05','ANTIOQUIA','05125','CAICEDO'),('05','ANTIOQUIA','05129','CALDAS'),('05','ANTIOQUIA','05134','CAMPAMENTO'),('05','ANTIOQUIA','05138','CAÑASGORDAS'),('05','ANTIOQUIA','05142','CARACOLÍ'),('05','ANTIOQUIA','05145','CARAMANTA'),('05','ANTIOQUIA','05147','CAREPA'),('05','ANTIOQUIA','05150','CAROLINA'),('05','ANTIOQUIA','05154','CAUCASIA'),('05','ANTIOQUIA','05172','CHIGORODÓ'),('05','ANTIOQUIA','05190','CISNEROS'),('05','ANTIOQUIA','05101','CIUDAD BOLÍVAR'),('05','ANTIOQUIA','05197','COCORNÁ'),('05','ANTIOQUIA','05206','CONCEPCIÓN'),('05','ANTIOQUIA','05209','CONCORDIA'),('05','ANTIOQUIA','05212','COPACABANA'),('05','ANTIOQUIA','05234','DABEIBA'),('05','ANTIOQUIA','05237','DONMATÍAS'),('05','ANTIOQUIA','05240','EBÉJICO'),('05','ANTIOQUIA','05250','EL BAGRE'),('05','ANTIOQUIA','05148','EL CARMEN DE VIBORAL'),('05','ANTIOQUIA','05697','EL SANTUARIO'),('05','ANTIOQUIA','05264','ENTRERRÍOS'),('05','ANTIOQUIA','05266','ENVIGADO'),('05','ANTIOQUIA','05282','FREDONIA'),('05','ANTIOQUIA','05284','FRONTINO'),('05','ANTIOQUIA','05306','GIRALDO'),('05','ANTIOQUIA','05308','GIRARDOTA'),('05','ANTIOQUIA','05310','GÓMEZ PLATA'),('05','ANTIOQUIA','05313','GRANADA'),('05','ANTIOQUIA','05315','GUADALUPE'),('05','ANTIOQUIA','05318','GUARNE'),('05','ANTIOQUIA','05321','GUATAPÉ'),('05','ANTIOQUIA','05347','HELICONIA'),('05','ANTIOQUIA','05353','HISPANIA'),('05','ANTIOQUIA','05360','ITAGÜÍ'),('05','ANTIOQUIA','05361','ITUANGO'),('05','ANTIOQUIA','05364','JARDÍN'),('05','ANTIOQUIA','05368','JERICÓ'),('05','ANTIOQUIA','05376','LA CEJA'),('05','ANTIOQUIA','05380','LA ESTRELLA'),('05','ANTIOQUIA','05390','LA PINTADA'),('05','ANTIOQUIA','05400','LA UNIÓN'),('05','ANTIOQUIA','05411','LIBORINA'),('05','ANTIOQUIA','05425','MACEO'),('05','ANTIOQUIA','05440','MARINILLA'),('05','ANTIOQUIA','05001','MEDELLÍN'),('05','ANTIOQUIA','05467','MONTEBELLO'),('05','ANTIOQUIA','05475','MURINDÓ'),('05','ANTIOQUIA','05480','MUTATÁ'),('05','ANTIOQUIA','05483','NARIÑO'),('05','ANTIOQUIA','05495','NECHÍ'),('05','ANTIOQUIA','05490','NECOCLÍ'),('05','ANTIOQUIA','05501','OLAYA'),('05','ANTIOQUIA','05541','PEÑOL'),('05','ANTIOQUIA','05543','PEQUE'),('05','ANTIOQUIA','05576','PUEBLORRICO'),('05','ANTIOQUIA','05579','PUERTO BERRÍO'),('05','ANTIOQUIA','05585','PUERTO NARE'),('05','ANTIOQUIA','05591','PUERTO TRIUNFO'),('05','ANTIOQUIA','05604','REMEDIOS'),('05','ANTIOQUIA','05607','RETIRO'),('05','ANTIOQUIA','05615','RIONEGRO'),('05','ANTIOQUIA','05628','SABANALARGA'),('05','ANTIOQUIA','05631','SABANETA'),('05','ANTIOQUIA','05642','SALGAR'),('05','ANTIOQUIA','05647','SAN ANDRÉS DE CUERQUÍA'),('05','ANTIOQUIA','05649','SAN CARLOS'),('05','ANTIOQUIA','05652','SAN FRANCISCO'),('05','ANTIOQUIA','05656','SAN JERÓNIMO'),('05','ANTIOQUIA','05658','SAN JOSÉ DE LA MONTAÑA'),('05','ANTIOQUIA','05659','SAN JUAN DE URABÁ'),('05','ANTIOQUIA','05660','SAN LUIS'),('05','ANTIOQUIA','05664','SAN PEDRO DE LOS MILAGROS'),('05','ANTIOQUIA','05665','SAN PEDRO DE URABÁ'),('05','ANTIOQUIA','05667','SAN RAFAEL'),('05','ANTIOQUIA','05670','SAN ROQUE'),('05','ANTIOQUIA','05679','SANTA BÁRBARA'),('05','ANTIOQUIA','05042','SANTA FÉ DE ANTIOQUIA'),('05','ANTIOQUIA','05686','SANTA ROSA DE OSOS'),('05','ANTIOQUIA','05690','SANTO DOMINGO'),('05','ANTIOQUIA','05674','SAN VICENTE FERRER'),('05','ANTIOQUIA','05736','SEGOVIA'),('05','ANTIOQUIA','05756','SONSÓN'),('05','ANTIOQUIA','05761','SOPETRÁN'),('05','ANTIOQUIA','05789','TÁMESIS'),('05','ANTIOQUIA','05790','TARAZÁ'),('05','ANTIOQUIA','05792','TARSO'),('05','ANTIOQUIA','05809','TITIRIBÍ'),('05','ANTIOQUIA','05819','TOLEDO'),('05','ANTIOQUIA','05837','TURBO'),('05','ANTIOQUIA','05842','URAMITA'),('05','ANTIOQUIA','05847','URRAO'),('05','ANTIOQUIA','05854','VALDIVIA'),('05','ANTIOQUIA','05856','VALPARAÍSO'),('05','ANTIOQUIA','05858','VEGACHÍ'),('05','ANTIOQUIA','05861','VENECIA'),('05','ANTIOQUIA','05873','VIGÍA DEL FUERTE'),('05','ANTIOQUIA','05885','YALÍ'),('05','ANTIOQUIA','05887','YARUMAL'),('05','ANTIOQUIA','05890','YOLOMBÓ'),('05','ANTIOQUIA','05893','YONDÓ'),('05','ANTIOQUIA','05895','ZARAGOZA'),('81','ARAUCA','81001','ARAUCA'),('81','ARAUCA','81065','ARAUQUITA'),('81','ARAUCA','81220','CRAVO NORTE'),('81','ARAUCA','81300','FORTUL'),('81','ARAUCA','81591','PUERTO RONDÓN'),('81','ARAUCA','81736','SARAVENA'),('81','ARAUCA','81794','TAME'),('88','ARCHIPIÉLAGO DE SAN ANDRÉS, PROVIDENCIA Y SANTA CATALINA','88564','PROVIDENCIA'),('88','ARCHIPIÉLAGO DE SAN ANDRÉS, PROVIDENCIA Y SANTA CATALINA','88001','SAN ANDRÉS'),('08','ATLÁNTICO','08078','BARANOA'),('08','ATLÁNTICO','08001','BARRANQUILLA'),('08','ATLÁNTICO','08137','CAMPO DE LA CRUZ'),('08','ATLÁNTICO','08141','CANDELARIA'),('08','ATLÁNTICO','08296','GALAPA'),('08','ATLÁNTICO','08372','JUAN DE ACOSTA'),('08','ATLÁNTICO','08421','LURUACO'),('08','ATLÁNTICO','08433','MALAMBO'),('08','ATLÁNTICO','08436','MANATÍ'),('08','ATLÁNTICO','08520','PALMAR DE VARELA'),('08','ATLÁNTICO','08549','PIOJÓ'),('08','ATLÁNTICO','08558','POLONUEVO'),('08','ATLÁNTICO','08560','PONEDERA'),('08','ATLÁNTICO','08573','PUERTO COLOMBIA'),('08','ATLÁNTICO','08606','REPELÓN'),('08','ATLÁNTICO','08634','SABANAGRANDE'),('08','ATLÁNTICO','08638','SABANALARGA'),('08','ATLÁNTICO','08675','SANTA LUCÍA'),('08','ATLÁNTICO','08685','SANTO TOMÁS'),('08','ATLÁNTICO','08758','SOLEDAD'),('08','ATLÁNTICO','08770','SUAN'),('08','ATLÁNTICO','08832','TUBARÁ'),('08','ATLÁNTICO','08849','USIACURÍ'),('11','BOGOTÁ, D.C.','11001','BOGOTÁ, D.C.'),('13','BOLÍVAR','13006','ACHÍ'),('13','BOLÍVAR','13030','ALTOS DEL ROSARIO'),('13','BOLÍVAR','13042','ARENAL'),('13','BOLÍVAR','13052','ARJONA'),('13','BOLÍVAR','13062','ARROYOHONDO'),('13','BOLÍVAR','13074','BARRANCO DE LOBA'),('13','BOLÍVAR','13140','CALAMAR'),('13','BOLÍVAR','13160','CANTAGALLO'),('13','BOLÍVAR','13001','CARTAGENA DE INDIAS'),('13','BOLÍVAR','13188','CICUCO'),('13','BOLÍVAR','13222','CLEMENCIA'),('13','BOLÍVAR','13212','CÓRDOBA'),('13','BOLÍVAR','13244','EL CARMEN DE BOLÍVAR'),('13','BOLÍVAR','13248','EL GUAMO'),('13','BOLÍVAR','13268','EL PEÑÓN'),('13','BOLÍVAR','13300','HATILLO DE LOBA'),('13','BOLÍVAR','13430','MAGANGUÉ'),('13','BOLÍVAR','13433','MAHATES'),('13','BOLÍVAR','13440','MARGARITA'),('13','BOLÍVAR','13442','MARÍA LA BAJA'),('13','BOLÍVAR','13458','MONTECRISTO'),('13','BOLÍVAR','13473','MORALES'),('13','BOLÍVAR','13490','NOROSÍ'),('13','BOLÍVAR','13549','PINILLOS'),('13','BOLÍVAR','13580','REGIDOR'),('13','BOLÍVAR','13600','RÍO VIEJO'),('13','BOLÍVAR','13620','SAN CRISTÓBAL'),('13','BOLÍVAR','13647','SAN ESTANISLAO'),('13','BOLÍVAR','13650','SAN FERNANDO'),('13','BOLÍVAR','13654','SAN JACINTO'),('13','BOLÍVAR','13655','SAN JACINTO DEL CAUCA'),('13','BOLÍVAR','13657','SAN JUAN NEPOMUCENO'),('13','BOLÍVAR','13667','SAN MARTÍN DE LOBA'),('13','BOLÍVAR','13670','SAN PABLO'),('13','BOLÍVAR','13673','SANTA CATALINA'),('13','BOLÍVAR','13468','SANTA CRUZ DE MOMPOX'),('13','BOLÍVAR','13683','SANTA ROSA'),('13','BOLÍVAR','13688','SANTA ROSA DEL SUR'),('13','BOLÍVAR','13744','SIMITÍ'),('13','BOLÍVAR','13760','SOPLAVIENTO'),('13','BOLÍVAR','13780','TALAIGUA NUEVO'),('13','BOLÍVAR','13810','TIQUISIO'),('13','BOLÍVAR','13836','TURBACO'),('13','BOLÍVAR','13838','TURBANÁ'),('13','BOLÍVAR','13873','VILLANUEVA'),('13','BOLÍVAR','13894','ZAMBRANO'),('15','BOYACÁ','15022','ALMEIDA'),('15','BOYACÁ','15047','AQUITANIA'),('15','BOYACÁ','15051','ARCABUCO'),('15','BOYACÁ','15087','BELÉN'),('15','BOYACÁ','15090','BERBEO'),('15','BOYACÁ','15092','BETÉITIVA'),('15','BOYACÁ','15097','BOAVITA'),('15','BOYACÁ','15104','BOYACÁ'),('15','BOYACÁ','15106','BRICEÑO'),('15','BOYACÁ','15109','BUENAVISTA'),('15','BOYACÁ','15114','BUSBANZÁ'),('15','BOYACÁ','15131','CALDAS'),('15','BOYACÁ','15135','CAMPOHERMOSO'),('15','BOYACÁ','15162','CERINZA'),('15','BOYACÁ','15172','CHINAVITA'),('15','BOYACÁ','15176','CHIQUINQUIRÁ'),('15','BOYACÁ','15232','CHÍQUIZA'),('15','BOYACÁ','15180','CHISCAS'),('15','BOYACÁ','15183','CHITA'),('15','BOYACÁ','15185','CHITARAQUE'),('15','BOYACÁ','15187','CHIVATÁ'),('15','BOYACÁ','15236','CHIVOR'),('15','BOYACÁ','15189','CIÉNEGA'),('15','BOYACÁ','15204','CÓMBITA'),('15','BOYACÁ','15212','COPER'),('15','BOYACÁ','15215','CORRALES'),('15','BOYACÁ','15218','COVARACHÍA'),('15','BOYACÁ','15223','CUBARÁ'),('15','BOYACÁ','15224','CUCAITA'),('15','BOYACÁ','15226','CUÍTIVA'),('15','BOYACÁ','15238','DUITAMA'),('15','BOYACÁ','15244','EL COCUY'),('15','BOYACÁ','15248','EL ESPINO'),('15','BOYACÁ','15272','FIRAVITOBA'),('15','BOYACÁ','15276','FLORESTA'),('15','BOYACÁ','15293','GACHANTIVÁ'),('15','BOYACÁ','15296','GÁMEZA'),('15','BOYACÁ','15299','GARAGOA'),('15','BOYACÁ','15317','GUACAMAYAS'),('15','BOYACÁ','15322','GUATEQUE'),('15','BOYACÁ','15325','GUAYATÁ'),('15','BOYACÁ','15332','GÜICÁN DE LA SIERRA'),('15','BOYACÁ','15362','IZA'),('15','BOYACÁ','15367','JENESANO'),('15','BOYACÁ','15368','JERICÓ'),('15','BOYACÁ','15377','LABRANZAGRANDE'),('15','BOYACÁ','15380','LA CAPILLA'),('15','BOYACÁ','15403','LA UVITA'),('15','BOYACÁ','15401','LA VICTORIA'),('15','BOYACÁ','15425','MACANAL'),('15','BOYACÁ','15442','MARIPÍ'),('15','BOYACÁ','15455','MIRAFLORES'),('15','BOYACÁ','15464','MONGUA'),('15','BOYACÁ','15466','MONGUÍ'),('15','BOYACÁ','15469','MONIQUIRÁ'),('15','BOYACÁ','15476','MOTAVITA'),('15','BOYACÁ','15480','MUZO'),('15','BOYACÁ','15491','NOBSA'),('15','BOYACÁ','15494','NUEVO COLÓN'),('15','BOYACÁ','15500','OICATÁ'),('15','BOYACÁ','15507','OTANCHE'),('15','BOYACÁ','15511','PACHAVITA'),('15','BOYACÁ','15514','PÁEZ'),('15','BOYACÁ','15516','PAIPA'),('15','BOYACÁ','15518','PAJARITO'),('15','BOYACÁ','15522','PANQUEBA'),('15','BOYACÁ','15531','PAUNA'),('15','BOYACÁ','15533','PAYA'),('15','BOYACÁ','15537','PAZ DE RÍO'),('15','BOYACÁ','15542','PESCA'),('15','BOYACÁ','15550','PISBA'),('15','BOYACÁ','15572','PUERTO BOYACÁ'),('15','BOYACÁ','15580','QUÍPAMA'),('15','BOYACÁ','15599','RAMIRIQUÍ'),('15','BOYACÁ','15600','RÁQUIRA'),('15','BOYACÁ','15621','RONDÓN'),('15','BOYACÁ','15632','SABOYÁ'),('15','BOYACÁ','15638','SÁCHICA'),('15','BOYACÁ','15646','SAMACÁ'),('15','BOYACÁ','15660','SAN EDUARDO'),('15','BOYACÁ','15664','SAN JOSÉ DE PARE'),('15','BOYACÁ','15667','SAN LUIS DE GACENO'),('15','BOYACÁ','15673','SAN MATEO'),('15','BOYACÁ','15676','SAN MIGUEL DE SEMA'),('15','BOYACÁ','15681','SAN PABLO DE BORBUR'),('15','BOYACÁ','15690','SANTA MARÍA'),('15','BOYACÁ','15686','SANTANA'),('15','BOYACÁ','15693','SANTA ROSA DE VITERBO'),('15','BOYACÁ','15696','SANTA SOFÍA'),('15','BOYACÁ','15720','SATIVANORTE'),('15','BOYACÁ','15723','SATIVASUR'),('15','BOYACÁ','15740','SIACHOQUE'),('15','BOYACÁ','15753','SOATÁ'),('15','BOYACÁ','15757','SOCHA'),('15','BOYACÁ','15755','SOCOTÁ'),('15','BOYACÁ','15759','SOGAMOSO'),('15','BOYACÁ','15761','SOMONDOCO'),('15','BOYACÁ','15762','SORA'),('15','BOYACÁ','15764','SORACÁ'),('15','BOYACÁ','15763','SOTAQUIRÁ'),('15','BOYACÁ','15774','SUSACÓN'),('15','BOYACÁ','15776','SUTAMARCHÁN'),('15','BOYACÁ','15778','SUTATENZA'),('15','BOYACÁ','15790','TASCO'),('15','BOYACÁ','15798','TENZA'),('15','BOYACÁ','15804','TIBANÁ'),('15','BOYACÁ','15806','TIBASOSA'),('15','BOYACÁ','15808','TINJACÁ'),('15','BOYACÁ','15810','TIPACOQUE'),('15','BOYACÁ','15814','TOCA'),('15','BOYACÁ','15816','TOGÜÍ'),('15','BOYACÁ','15820','TÓPAGA'),('15','BOYACÁ','15822','TOTA'),('15','BOYACÁ','15001','TUNJA'),('15','BOYACÁ','15832','TUNUNGUÁ'),('15','BOYACÁ','15835','TURMEQUÉ'),('15','BOYACÁ','15837','TUTA'),('15','BOYACÁ','15839','TUTAZÁ'),('15','BOYACÁ','15842','ÚMBITA'),('15','BOYACÁ','15861','VENTAQUEMADA'),('15','BOYACÁ','15407','VILLA DE LEYVA'),('15','BOYACÁ','15879','VIRACACHÁ'),('15','BOYACÁ','15897','ZETAQUIRA'),('17','CALDAS','17013','AGUADAS'),('17','CALDAS','17042','ANSERMA'),('17','CALDAS','17050','ARANZAZU'),('17','CALDAS','17088','BELALCÁZAR'),('17','CALDAS','17174','CHINCHINÁ'),('17','CALDAS','17272','FILADELFIA'),('17','CALDAS','17380','LA DORADA'),('17','CALDAS','17388','LA MERCED'),('17','CALDAS','17001','MANIZALES'),('17','CALDAS','17433','MANZANARES'),('17','CALDAS','17442','MARMATO'),('17','CALDAS','17444','MARQUETALIA'),('17','CALDAS','17446','MARULANDA'),('17','CALDAS','17486','NEIRA'),('17','CALDAS','17495','NORCASIA'),('17','CALDAS','17513','PÁCORA'),('17','CALDAS','17524','PALESTINA'),('17','CALDAS','17541','PENSILVANIA'),('17','CALDAS','17614','RIOSUCIO'),('17','CALDAS','17616','RISARALDA'),('17','CALDAS','17653','SALAMINA'),('17','CALDAS','17662','SAMANÁ'),('17','CALDAS','17665','SAN JOSÉ'),('17','CALDAS','17777','SUPÍA'),('17','CALDAS','17867','VICTORIA'),('17','CALDAS','17873','VILLAMARÍA'),('17','CALDAS','17877','VITERBO'),('18','CAQUETÁ','18029','ALBANIA'),('18','CAQUETÁ','18094','BELÉN DE LOS ANDAQUÍES'),('18','CAQUETÁ','18150','CARTAGENA DEL CHAIRÁ'),('18','CAQUETÁ','18205','CURILLO'),('18','CAQUETÁ','18247','EL DONCELLO'),('18','CAQUETÁ','18256','EL PAUJÍL'),('18','CAQUETÁ','18001','FLORENCIA'),('18','CAQUETÁ','18410','LA MONTAÑITA'),('18','CAQUETÁ','18460','MILÁN'),('18','CAQUETÁ','18479','MORELIA'),('18','CAQUETÁ','18592','PUERTO RICO'),('18','CAQUETÁ','18610','SAN JOSÉ DEL FRAGUA'),('18','CAQUETÁ','18753','SAN VICENTE DEL CAGUÁN'),('18','CAQUETÁ','18756','SOLANO'),('18','CAQUETÁ','18785','SOLITA'),('18','CAQUETÁ','18860','VALPARAÍSO'),('85','CASANARE','85010','AGUAZUL'),('85','CASANARE','85015','CHÁMEZA'),('85','CASANARE','85125','HATO COROZAL'),('85','CASANARE','85136','LA SALINA'),('85','CASANARE','85139','MANÍ'),('85','CASANARE','85162','MONTERREY'),('85','CASANARE','85225','NUNCHÍA'),('85','CASANARE','85230','OROCUÉ'),('85','CASANARE','85250','PAZ DE ARIPORO'),('85','CASANARE','85263','PORE'),('85','CASANARE','85279','RECETOR'),('85','CASANARE','85300','SABANALARGA'),('85','CASANARE','85315','SÁCAMA'),('85','CASANARE','85325','SAN LUIS DE PALENQUE'),('85','CASANARE','85400','TÁMARA'),('85','CASANARE','85410','TAURAMENA'),('85','CASANARE','85430','TRINIDAD'),('85','CASANARE','85440','VILLANUEVA'),('85','CASANARE','85001','YOPAL'),('19','CAUCA','19022','ALMAGUER'),('19','CAUCA','19050','ARGELIA'),('19','CAUCA','19075','BALBOA'),('19','CAUCA','19100','BOLÍVAR'),('19','CAUCA','19110','BUENOS AIRES'),('19','CAUCA','19130','CAJIBÍO'),('19','CAUCA','19137','CALDONO'),('19','CAUCA','19142','CALOTO'),('19','CAUCA','19212','CORINTO'),('19','CAUCA','19256','EL TAMBO'),('19','CAUCA','19290','FLORENCIA'),('19','CAUCA','19300','GUACHENÉ'),('19','CAUCA','19318','GUAPI'),('19','CAUCA','19355','INZÁ'),('19','CAUCA','19364','JAMBALÓ'),('19','CAUCA','19392','LA SIERRA'),('19','CAUCA','19397','LA VEGA'),('19','CAUCA','19418','LÓPEZ DE MICAY'),('19','CAUCA','19450','MERCADERES'),('19','CAUCA','19455','MIRANDA'),('19','CAUCA','19473','MORALES'),('19','CAUCA','19513','PADILLA'),('19','CAUCA','19517','PÁEZ'),('19','CAUCA','19532','PATÍA'),('19','CAUCA','19533','PIAMONTE'),('19','CAUCA','19548','PIENDAMÓ - TUNÍA'),('19','CAUCA','19001','POPAYÁN'),('19','CAUCA','19573','PUERTO TEJADA'),('19','CAUCA','19585','PURACÉ'),('19','CAUCA','19622','ROSAS'),('19','CAUCA','19693','SAN SEBASTIÁN'),('19','CAUCA','19698','SANTANDER DE QUILICHAO'),('19','CAUCA','19701','SANTA ROSA'),('19','CAUCA','19743','SILVIA'),('19','CAUCA','19760','SOTARÁ - PAISPAMBA'),('19','CAUCA','19780','SUÁREZ'),('19','CAUCA','19785','SUCRE'),('19','CAUCA','19807','TIMBÍO'),('19','CAUCA','19809','TIMBIQUÍ'),('19','CAUCA','19821','TORIBÍO'),('19','CAUCA','19824','TOTORÓ'),('19','CAUCA','19845','VILLA RICA'),('20','CESAR','20011','AGUACHICA'),('20','CESAR','20013','AGUSTÍN CODAZZI'),('20','CESAR','20032','ASTREA'),('20','CESAR','20045','BECERRIL'),('20','CESAR','20060','BOSCONIA'),('20','CESAR','20175','CHIMICHAGUA'),('20','CESAR','20178','CHIRIGUANÁ'),('20','CESAR','20228','CURUMANÍ'),('20','CESAR','20238','EL COPEY'),('20','CESAR','20250','EL PASO'),('20','CESAR','20295','GAMARRA'),('20','CESAR','20310','GONZÁLEZ'),('20','CESAR','20383','LA GLORIA'),('20','CESAR','20400','LA JAGUA DE IBIRICO'),('20','CESAR','20621','LA PAZ'),('20','CESAR','20443','MANAURE BALCÓN DEL CESAR'),('20','CESAR','20517','PAILITAS'),('20','CESAR','20550','PELAYA'),('20','CESAR','20570','PUEBLO BELLO'),('20','CESAR','20614','RÍO DE ORO'),('20','CESAR','20710','SAN ALBERTO'),('20','CESAR','20750','SAN DIEGO'),('20','CESAR','20770','SAN MARTÍN'),('20','CESAR','20787','TAMALAMEQUE'),('20','CESAR','20001','VALLEDUPAR'),('27','CHOCÓ','27006','ACANDÍ'),('27','CHOCÓ','27025','ALTO BAUDÓ'),('27','CHOCÓ','27050','ATRATO'),('27','CHOCÓ','27073','BAGADÓ'),('27','CHOCÓ','27075','BAHÍA SOLANO'),('27','CHOCÓ','27077','BAJO BAUDÓ'),('27','CHOCÓ','27099','BOJAYÁ'),('27','CHOCÓ','27150','CARMEN DEL DARIÉN'),('27','CHOCÓ','27160','CÉRTEGUI'),('27','CHOCÓ','27205','CONDOTO'),('27','CHOCÓ','27135','EL CANTÓN DEL SAN PABLO'),('27','CHOCÓ','27245','EL CARMEN DE ATRATO'),('27','CHOCÓ','27250','EL LITORAL DEL SAN JUAN'),('27','CHOCÓ','27361','ISTMINA'),('27','CHOCÓ','27372','JURADÓ'),('27','CHOCÓ','27413','LLORÓ'),('27','CHOCÓ','27425','MEDIO ATRATO'),('27','CHOCÓ','27430','MEDIO BAUDÓ'),('27','CHOCÓ','27450','MEDIO SAN JUAN'),('27','CHOCÓ','27491','NÓVITA'),('27','CHOCÓ','27493','NUEVO BELÉN DE BAJIRÁ'),('27','CHOCÓ','27495','NUQUÍ'),('27','CHOCÓ','27001','QUIBDÓ'),('27','CHOCÓ','27580','RÍO IRÓ'),('27','CHOCÓ','27600','RÍO QUITO'),('27','CHOCÓ','27615','RIOSUCIO'),('27','CHOCÓ','27660','SAN JOSÉ DEL PALMAR'),('27','CHOCÓ','27745','SIPÍ'),('27','CHOCÓ','27787','TADÓ'),('27','CHOCÓ','27800','UNGUÍA'),('27','CHOCÓ','27810','UNIÓN PANAMERICANA'),('23','CÓRDOBA','23068','AYAPEL'),('23','CÓRDOBA','23079','BUENAVISTA'),('23','CÓRDOBA','23090','CANALETE'),('23','CÓRDOBA','23162','CERETÉ'),('23','CÓRDOBA','23168','CHIMÁ'),('23','CÓRDOBA','23182','CHINÚ'),('23','CÓRDOBA','23189','CIÉNAGA DE ORO'),('23','CÓRDOBA','23300','COTORRA'),('23','CÓRDOBA','23350','LA APARTADA'),('23','CÓRDOBA','23417','LORICA'),('23','CÓRDOBA','23419','LOS CÓRDOBAS'),('23','CÓRDOBA','23464','MOMIL'),('23','CÓRDOBA','23500','MOÑITOS'),('23','CÓRDOBA','23466','MONTELÍBANO'),('23','CÓRDOBA','23001','MONTERÍA'),('23','CÓRDOBA','23555','PLANETA RICA'),('23','CÓRDOBA','23570','PUEBLO NUEVO'),('23','CÓRDOBA','23574','PUERTO ESCONDIDO'),('23','CÓRDOBA','23580','PUERTO LIBERTADOR'),('23','CÓRDOBA','23586','PURÍSIMA DE LA CONCEPCIÓN'),('23','CÓRDOBA','23660','SAHAGÚN'),('23','CÓRDOBA','23670','SAN ANDRÉS DE SOTAVENTO'),('23','CÓRDOBA','23672','SAN ANTERO'),('23','CÓRDOBA','23675','SAN BERNARDO DEL VIENTO'),('23','CÓRDOBA','23678','SAN CARLOS'),('23','CÓRDOBA','23682','SAN JOSÉ DE URÉ'),('23','CÓRDOBA','23686','SAN PELAYO'),('23','CÓRDOBA','23807','TIERRALTA'),('23','CÓRDOBA','23815','TUCHÍN'),('23','CÓRDOBA','23855','VALENCIA'),('25','CUNDINAMARCA','25001','AGUA DE DIOS'),('25','CUNDINAMARCA','25019','ALBÁN'),('25','CUNDINAMARCA','25035','ANAPOIMA'),('25','CUNDINAMARCA','25040','ANOLAIMA'),('25','CUNDINAMARCA','25599','APULO'),('25','CUNDINAMARCA','25053','ARBELÁEZ'),('25','CUNDINAMARCA','25086','BELTRÁN'),('25','CUNDINAMARCA','25095','BITUIMA'),('25','CUNDINAMARCA','25099','BOJACÁ'),('25','CUNDINAMARCA','25120','CABRERA'),('25','CUNDINAMARCA','25123','CACHIPAY'),('25','CUNDINAMARCA','25126','CAJICÁ'),('25','CUNDINAMARCA','25148','CAPARRAPÍ'),('25','CUNDINAMARCA','25151','CÁQUEZA'),('25','CUNDINAMARCA','25154','CARMEN DE CARUPA'),('25','CUNDINAMARCA','25168','CHAGUANÍ'),('25','CUNDINAMARCA','25175','CHÍA'),('25','CUNDINAMARCA','25178','CHIPAQUE'),('25','CUNDINAMARCA','25181','CHOACHÍ'),('25','CUNDINAMARCA','25183','CHOCONTÁ'),('25','CUNDINAMARCA','25200','COGUA'),('25','CUNDINAMARCA','25214','COTA'),('25','CUNDINAMARCA','25224','CUCUNUBÁ'),('25','CUNDINAMARCA','25245','EL COLEGIO'),('25','CUNDINAMARCA','25258','EL PEÑÓN'),('25','CUNDINAMARCA','25260','EL ROSAL'),('25','CUNDINAMARCA','25269','FACATATIVÁ'),('25','CUNDINAMARCA','25279','FÓMEQUE'),('25','CUNDINAMARCA','25281','FOSCA'),('25','CUNDINAMARCA','25286','FUNZA'),('25','CUNDINAMARCA','25288','FÚQUENE'),('25','CUNDINAMARCA','25290','FUSAGASUGÁ'),('25','CUNDINAMARCA','25293','GACHALÁ'),('25','CUNDINAMARCA','25295','GACHANCIPÁ'),('25','CUNDINAMARCA','25297','GACHETÁ'),('25','CUNDINAMARCA','25299','GAMA'),('25','CUNDINAMARCA','25307','GIRARDOT'),('25','CUNDINAMARCA','25312','GRANADA'),('25','CUNDINAMARCA','25317','GUACHETÁ'),('25','CUNDINAMARCA','25320','GUADUAS'),('25','CUNDINAMARCA','25322','GUASCA'),('25','CUNDINAMARCA','25324','GUATAQUÍ'),('25','CUNDINAMARCA','25326','GUATAVITA'),('25','CUNDINAMARCA','25328','GUAYABAL DE SÍQUIMA'),('25','CUNDINAMARCA','25335','GUAYABETAL'),('25','CUNDINAMARCA','25339','GUTIÉRREZ'),('25','CUNDINAMARCA','25368','JERUSALÉN'),('25','CUNDINAMARCA','25372','JUNÍN'),('25','CUNDINAMARCA','25377','LA CALERA'),('25','CUNDINAMARCA','25386','LA MESA'),('25','CUNDINAMARCA','25394','LA PALMA'),('25','CUNDINAMARCA','25398','LA PEÑA'),('25','CUNDINAMARCA','25402','LA VEGA'),('25','CUNDINAMARCA','25407','LENGUAZAQUE'),('25','CUNDINAMARCA','25426','MACHETÁ'),('25','CUNDINAMARCA','25430','MADRID'),('25','CUNDINAMARCA','25436','MANTA'),('25','CUNDINAMARCA','25438','MEDINA'),('25','CUNDINAMARCA','25473','MOSQUERA'),('25','CUNDINAMARCA','25483','NARIÑO'),('25','CUNDINAMARCA','25486','NEMOCÓN'),('25','CUNDINAMARCA','25488','NILO'),('25','CUNDINAMARCA','25489','NIMAIMA'),('25','CUNDINAMARCA','25491','NOCAIMA'),('25','CUNDINAMARCA','25513','PACHO'),('25','CUNDINAMARCA','25518','PAIME'),('25','CUNDINAMARCA','25524','PANDI'),('25','CUNDINAMARCA','25530','PARATEBUENO'),('25','CUNDINAMARCA','25535','PASCA'),('25','CUNDINAMARCA','25572','PUERTO SALGAR'),('25','CUNDINAMARCA','25580','PULÍ'),('25','CUNDINAMARCA','25592','QUEBRADANEGRA'),('25','CUNDINAMARCA','25594','QUETAME'),('25','CUNDINAMARCA','25596','QUIPILE'),('25','CUNDINAMARCA','25612','RICAURTE'),('25','CUNDINAMARCA','25645','SAN ANTONIO DEL TEQUENDAMA'),('25','CUNDINAMARCA','25649','SAN BERNARDO'),('25','CUNDINAMARCA','25653','SAN CAYETANO'),('25','CUNDINAMARCA','25658','SAN FRANCISCO'),('25','CUNDINAMARCA','25662','SAN JUAN DE RIOSECO'),('25','CUNDINAMARCA','25718','SASAIMA'),('25','CUNDINAMARCA','25736','SESQUILÉ'),('25','CUNDINAMARCA','25740','SIBATÉ'),('25','CUNDINAMARCA','25743','SILVANIA'),('25','CUNDINAMARCA','25745','SIMIJACA'),('25','CUNDINAMARCA','25754','SOACHA'),('25','CUNDINAMARCA','25758','SOPÓ'),('25','CUNDINAMARCA','25769','SUBACHOQUE'),('25','CUNDINAMARCA','25772','SUESCA'),('25','CUNDINAMARCA','25777','SUPATÁ'),('25','CUNDINAMARCA','25779','SUSA'),('25','CUNDINAMARCA','25781','SUTATAUSA'),('25','CUNDINAMARCA','25785','TABIO'),('25','CUNDINAMARCA','25793','TAUSA'),('25','CUNDINAMARCA','25797','TENA'),('25','CUNDINAMARCA','25799','TENJO'),('25','CUNDINAMARCA','25805','TIBACUY'),('25','CUNDINAMARCA','25807','TIBIRITA'),('25','CUNDINAMARCA','25815','TOCAIMA'),('25','CUNDINAMARCA','25817','TOCANCIPÁ'),('25','CUNDINAMARCA','25823','TOPAIPÍ'),('25','CUNDINAMARCA','25839','UBALÁ'),('25','CUNDINAMARCA','25841','UBAQUE'),('25','CUNDINAMARCA','25845','UNE'),('25','CUNDINAMARCA','25851','ÚTICA'),('25','CUNDINAMARCA','25506','VENECIA'),('25','CUNDINAMARCA','25862','VERGARA'),('25','CUNDINAMARCA','25867','VIANÍ'),('25','CUNDINAMARCA','25843','VILLA DE SAN DIEGO DE UBATÉ'),('25','CUNDINAMARCA','25871','VILLAGÓMEZ'),('25','CUNDINAMARCA','25873','VILLAPINZÓN'),('25','CUNDINAMARCA','25875','VILLETA'),('25','CUNDINAMARCA','25878','VIOTÁ'),('25','CUNDINAMARCA','25885','YACOPÍ'),('25','CUNDINAMARCA','25898','ZIPACÓN'),('25','CUNDINAMARCA','25899','ZIPAQUIRÁ'),('94','GUAINÍA','94343','BARRANCOMINAS'),('94','GUAINÍA','94886','CACAHUAL'),('94','GUAINÍA','94001','INÍRIDA'),('94','GUAINÍA','94885','LA GUADALUPE'),('94','GUAINÍA','94888','MORICHAL'),('94','GUAINÍA','94887','PANA PANA'),('94','GUAINÍA','94884','PUERTO COLOMBIA'),('94','GUAINÍA','94883','SAN FELIPE'),('95','GUAVIARE','95015','CALAMAR'),('95','GUAVIARE','95025','EL RETORNO'),('95','GUAVIARE','95200','MIRAFLORES'),('95','GUAVIARE','95001','SAN JOSÉ DEL GUAVIARE'),('41','HUILA','41006','ACEVEDO'),('41','HUILA','41013','AGRADO'),('41','HUILA','41016','AIPE'),('41','HUILA','41020','ALGECIRAS'),('41','HUILA','41026','ALTAMIRA'),('41','HUILA','41078','BARAYA'),('41','HUILA','41132','CAMPOALEGRE'),('41','HUILA','41206','COLOMBIA'),('41','HUILA','41244','ELÍAS'),('41','HUILA','41298','GARZÓN'),('41','HUILA','41306','GIGANTE'),('41','HUILA','41319','GUADALUPE'),('41','HUILA','41349','HOBO'),('41','HUILA','41357','ÍQUIRA'),('41','HUILA','41359','ISNOS'),('41','HUILA','41378','LA ARGENTINA'),('41','HUILA','41396','LA PLATA'),('41','HUILA','41483','NÁTAGA'),('41','HUILA','41001','NEIVA'),('41','HUILA','41503','OPORAPA'),('41','HUILA','41518','PAICOL'),('41','HUILA','41524','PALERMO'),('41','HUILA','41530','PALESTINA'),('41','HUILA','41548','PITAL'),('41','HUILA','41551','PITALITO'),('41','HUILA','41615','RIVERA'),('41','HUILA','41660','SALADOBLANCO'),('41','HUILA','41668','SAN AGUSTÍN'),('41','HUILA','41676','SANTA MARÍA'),('41','HUILA','41770','SUAZA'),('41','HUILA','41791','TARQUI'),('41','HUILA','41799','TELLO'),('41','HUILA','41801','TERUEL'),('41','HUILA','41797','TESALIA'),('41','HUILA','41807','TIMANÁ'),('41','HUILA','41872','VILLAVIEJA'),('41','HUILA','41885','YAGUARÁ'),('44','LA GUAJIRA','44035','ALBANIA'),('44','LA GUAJIRA','44078','BARRANCAS'),('44','LA GUAJIRA','44090','DIBULLA'),('44','LA GUAJIRA','44098','DISTRACCIÓN'),('44','LA GUAJIRA','44110','EL MOLINO'),('44','LA GUAJIRA','44279','FONSECA'),('44','LA GUAJIRA','44378','HATONUEVO'),('44','LA GUAJIRA','44420','LA JAGUA DEL PILAR'),('44','LA GUAJIRA','44430','MAICAO'),('44','LA GUAJIRA','44560','MANAURE'),('44','LA GUAJIRA','44001','RIOHACHA'),('44','LA GUAJIRA','44650','SAN JUAN DEL CESAR'),('44','LA GUAJIRA','44847','URIBIA'),('44','LA GUAJIRA','44855','URUMITA'),('44','LA GUAJIRA','44874','VILLANUEVA'),('47','MAGDALENA','47030','ALGARROBO'),('47','MAGDALENA','47053','ARACATACA'),('47','MAGDALENA','47058','ARIGUANÍ'),('47','MAGDALENA','47161','CERRO DE SAN ANTONIO'),('47','MAGDALENA','47170','CHIVOLO'),('47','MAGDALENA','47189','CIÉNAGA'),('47','MAGDALENA','47205','CONCORDIA'),('47','MAGDALENA','47245','EL BANCO'),('47','MAGDALENA','47258','EL PIÑÓN'),('47','MAGDALENA','47268','EL RETÉN'),('47','MAGDALENA','47288','FUNDACIÓN'),('47','MAGDALENA','47318','GUAMAL'),('47','MAGDALENA','47460','NUEVA GRANADA'),('47','MAGDALENA','47541','PEDRAZA'),('47','MAGDALENA','47545','PIJIÑO DEL CARMEN'),('47','MAGDALENA','47551','PIVIJAY'),('47','MAGDALENA','47555','PLATO'),('47','MAGDALENA','47570','PUEBLOVIEJO'),('47','MAGDALENA','47605','REMOLINO'),('47','MAGDALENA','47660','SABANAS DE SAN ÁNGEL'),('47','MAGDALENA','47675','SALAMINA'),('47','MAGDALENA','47692','SAN SEBASTIÁN DE BUENAVISTA'),('47','MAGDALENA','47707','SANTA ANA'),('47','MAGDALENA','47720','SANTA BÁRBARA DE PINTO'),('47','MAGDALENA','47001','SANTA MARTA'),('47','MAGDALENA','47703','SAN ZENÓN'),('47','MAGDALENA','47745','SITIONUEVO'),('47','MAGDALENA','47798','TENERIFE'),('47','MAGDALENA','47960','ZAPAYÁN'),('47','MAGDALENA','47980','ZONA BANANERA'),('50','META','50006','ACACÍAS'),('50','META','50110','BARRANCA DE UPÍA'),('50','META','50124','CABUYARO'),('50','META','50150','CASTILLA LA NUEVA'),('50','META','50223','CUBARRAL'),('50','META','50226','CUMARAL'),('50','META','50245','EL CALVARIO'),('50','META','50251','EL CASTILLO'),('50','META','50270','EL DORADO'),('50','META','50287','FUENTE DE ORO'),('50','META','50313','GRANADA'),('50','META','50318','GUAMAL'),('50','META','50350','LA MACARENA'),('50','META','50400','LEJANÍAS'),('50','META','50325','MAPIRIPÁN'),('50','META','50330','MESETAS'),('50','META','50450','PUERTO CONCORDIA'),('50','META','50568','PUERTO GAITÁN'),('50','META','50577','PUERTO LLERAS'),('50','META','50573','PUERTO LÓPEZ'),('50','META','50590','PUERTO RICO'),('50','META','50606','RESTREPO'),('50','META','50680','SAN CARLOS DE GUAROA'),('50','META','50683','SAN JUAN DE ARAMA'),('50','META','50686','SAN JUANITO'),('50','META','50689','SAN MARTÍN'),('50','META','50370','URIBE'),('50','META','50001','VILLAVICENCIO'),('50','META','50711','VISTAHERMOSA'),('52','NARIÑO','52019','ALBÁN'),('52','NARIÑO','52022','ALDANA'),('52','NARIÑO','52036','ANCUYA'),('52','NARIÑO','52051','ARBOLEDA'),('52','NARIÑO','52079','BARBACOAS'),('52','NARIÑO','52083','BELÉN'),('52','NARIÑO','52110','BUESACO'),('52','NARIÑO','52240','CHACHAGÜÍ'),('52','NARIÑO','52203','COLÓN'),('52','NARIÑO','52207','CONSACÁ'),('52','NARIÑO','52210','CONTADERO'),('52','NARIÑO','52215','CÓRDOBA'),('52','NARIÑO','52224','CUASPUD CARLOSAMA'),('52','NARIÑO','52227','CUMBAL'),('52','NARIÑO','52233','CUMBITARA'),('52','NARIÑO','52250','EL CHARCO'),('52','NARIÑO','52254','EL PEÑOL'),('52','NARIÑO','52256','EL ROSARIO'),('52','NARIÑO','52258','EL TABLÓN DE GÓMEZ'),('52','NARIÑO','52260','EL TAMBO'),('52','NARIÑO','52520','FRANCISCO PIZARRO'),('52','NARIÑO','52287','FUNES'),('52','NARIÑO','52317','GUACHUCAL'),('52','NARIÑO','52320','GUAITARILLA'),('52','NARIÑO','52323','GUALMATÁN'),('52','NARIÑO','52352','ILES'),('52','NARIÑO','52354','IMUÉS'),('52','NARIÑO','52356','IPIALES'),('52','NARIÑO','52378','LA CRUZ'),('52','NARIÑO','52381','LA FLORIDA'),('52','NARIÑO','52385','LA LLANADA'),('52','NARIÑO','52390','LA TOLA'),('52','NARIÑO','52399','LA UNIÓN'),('52','NARIÑO','52405','LEIVA'),('52','NARIÑO','52411','LINARES'),('52','NARIÑO','52418','LOS ANDES'),('52','NARIÑO','52427','MAGÜÍ'),('52','NARIÑO','52435','MALLAMA'),('52','NARIÑO','52473','MOSQUERA'),('52','NARIÑO','52480','NARIÑO'),('52','NARIÑO','52490','OLAYA HERRERA'),('52','NARIÑO','52506','OSPINA'),('52','NARIÑO','52001','PASTO'),('52','NARIÑO','52540','POLICARPA'),('52','NARIÑO','52560','POTOSÍ'),('52','NARIÑO','52565','PROVIDENCIA'),('52','NARIÑO','52573','PUERRES'),('52','NARIÑO','52585','PUPIALES'),('52','NARIÑO','52612','RICAURTE'),('52','NARIÑO','52621','ROBERTO PAYÁN'),('52','NARIÑO','52678','SAMANIEGO'),('52','NARIÑO','52835','SAN ANDRÉS DE TUMACO'),('52','NARIÑO','52685','SAN BERNARDO'),('52','NARIÑO','52683','SANDONÁ'),('52','NARIÑO','52687','SAN LORENZO'),('52','NARIÑO','52693','SAN PABLO'),('52','NARIÑO','52694','SAN PEDRO DE CARTAGO'),('52','NARIÑO','52696','SANTA BÁRBARA'),('52','NARIÑO','52699','SANTACRUZ'),('52','NARIÑO','52720','SAPUYES'),('52','NARIÑO','52786','TAMINANGO'),('52','NARIÑO','52788','TANGUA'),('52','NARIÑO','52838','TÚQUERRES'),('52','NARIÑO','52885','YACUANQUER'),('54','NORTE DE SANTANDER','54003','ÁBREGO'),('54','NORTE DE SANTANDER','54051','ARBOLEDAS'),('54','NORTE DE SANTANDER','54099','BOCHALEMA'),('54','NORTE DE SANTANDER','54109','BUCARASICA'),('54','NORTE DE SANTANDER','54128','CÁCHIRA'),('54','NORTE DE SANTANDER','54125','CÁCOTA'),('54','NORTE DE SANTANDER','54172','CHINÁCOTA'),('54','NORTE DE SANTANDER','54174','CHITAGÁ'),('54','NORTE DE SANTANDER','54206','CONVENCIÓN'),('54','NORTE DE SANTANDER','54223','CUCUTILLA'),('54','NORTE DE SANTANDER','54239','DURANIA'),('54','NORTE DE SANTANDER','54245','EL CARMEN'),('54','NORTE DE SANTANDER','54250','EL TARRA'),('54','NORTE DE SANTANDER','54261','EL ZULIA'),('54','NORTE DE SANTANDER','54313','GRAMALOTE'),('54','NORTE DE SANTANDER','54344','HACARÍ'),('54','NORTE DE SANTANDER','54347','HERRÁN'),('54','NORTE DE SANTANDER','54377','LABATECA'),('54','NORTE DE SANTANDER','54385','LA ESPERANZA'),('54','NORTE DE SANTANDER','54398','LA PLAYA'),('54','NORTE DE SANTANDER','54405','LOS PATIOS'),('54','NORTE DE SANTANDER','54418','LOURDES'),('54','NORTE DE SANTANDER','54480','MUTISCUA'),('54','NORTE DE SANTANDER','54498','OCAÑA'),('54','NORTE DE SANTANDER','54518','PAMPLONA'),('54','NORTE DE SANTANDER','54520','PAMPLONITA'),('54','NORTE DE SANTANDER','54553','PUERTO SANTANDER'),('54','NORTE DE SANTANDER','54599','RAGONVALIA'),('54','NORTE DE SANTANDER','54660','SALAZAR'),('54','NORTE DE SANTANDER','54670','SAN CALIXTO'),('54','NORTE DE SANTANDER','54673','SAN CAYETANO'),('54','NORTE DE SANTANDER','54001','SAN JOSÉ DE CÚCUTA'),('54','NORTE DE SANTANDER','54680','SANTIAGO'),('54','NORTE DE SANTANDER','54720','SARDINATA'),('54','NORTE DE SANTANDER','54743','SILOS'),('54','NORTE DE SANTANDER','54800','TEORAMA'),('54','NORTE DE SANTANDER','54810','TIBÚ'),('54','NORTE DE SANTANDER','54820','TOLEDO'),('54','NORTE DE SANTANDER','54871','VILLA CARO'),('54','NORTE DE SANTANDER','54874','VILLA DEL ROSARIO'),('86','PUTUMAYO','86219','COLÓN'),('86','PUTUMAYO','86001','MOCOA'),('86','PUTUMAYO','86320','ORITO'),('86','PUTUMAYO','86568','PUERTO ASÍS'),('86','PUTUMAYO','86569','PUERTO CAICEDO'),('86','PUTUMAYO','86571','PUERTO GUZMÁN'),('86','PUTUMAYO','86573','PUERTO LEGUÍZAMO'),('86','PUTUMAYO','86755','SAN FRANCISCO'),('86','PUTUMAYO','86757','SAN MIGUEL'),('86','PUTUMAYO','86760','SANTIAGO'),('86','PUTUMAYO','86749','SIBUNDOY'),('86','PUTUMAYO','86865','VALLE DEL GUAMUEZ'),('86','PUTUMAYO','86885','VILLAGARZÓN'),('63','QUINDÍO','63001','ARMENIA'),('63','QUINDÍO','63111','BUENAVISTA'),('63','QUINDÍO','63130','CALARCÁ'),('63','QUINDÍO','63190','CIRCASIA'),('63','QUINDÍO','63212','CÓRDOBA'),('63','QUINDÍO','63272','FILANDIA'),('63','QUINDÍO','63302','GÉNOVA'),('63','QUINDÍO','63401','LA TEBAIDA'),('63','QUINDÍO','63470','MONTENEGRO'),('63','QUINDÍO','63548','PIJAO'),('63','QUINDÍO','63594','QUIMBAYA'),('63','QUINDÍO','63690','SALENTO'),('66','RISARALDA','66045','APÍA'),('66','RISARALDA','66075','BALBOA'),('66','RISARALDA','66088','BELÉN DE UMBRÍA'),('66','RISARALDA','66170','DOSQUEBRADAS'),('66','RISARALDA','66318','GUÁTICA'),('66','RISARALDA','66383','LA CELIA'),('66','RISARALDA','66400','LA VIRGINIA'),('66','RISARALDA','66440','MARSELLA'),('66','RISARALDA','66456','MISTRATÓ'),('66','RISARALDA','66001','PEREIRA'),('66','RISARALDA','66572','PUEBLO RICO'),('66','RISARALDA','66594','QUINCHÍA'),('66','RISARALDA','66682','SANTA ROSA DE CABAL'),('66','RISARALDA','66687','SANTUARIO'),('68','SANTANDER','68013','AGUADA'),('68','SANTANDER','68020','ALBANIA'),('68','SANTANDER','68051','ARATOCA'),('68','SANTANDER','68077','BARBOSA'),('68','SANTANDER','68079','BARICHARA'),('68','SANTANDER','68081','BARRANCABERMEJA'),('68','SANTANDER','68092','BETULIA'),('68','SANTANDER','68101','BOLÍVAR'),('68','SANTANDER','68001','BUCARAMANGA'),('68','SANTANDER','68121','CABRERA'),('68','SANTANDER','68132','CALIFORNIA'),('68','SANTANDER','68147','CAPITANEJO'),('68','SANTANDER','68152','CARCASÍ'),('68','SANTANDER','68160','CEPITÁ'),('68','SANTANDER','68162','CERRITO'),('68','SANTANDER','68167','CHARALÁ'),('68','SANTANDER','68169','CHARTA'),('68','SANTANDER','68176','CHIMA'),('68','SANTANDER','68179','CHIPATÁ'),('68','SANTANDER','68190','CIMITARRA'),('68','SANTANDER','68207','CONCEPCIÓN'),('68','SANTANDER','68209','CONFINES'),('68','SANTANDER','68211','CONTRATACIÓN'),('68','SANTANDER','68217','COROMORO'),('68','SANTANDER','68229','CURITÍ'),('68','SANTANDER','68235','EL CARMEN DE CHUCURÍ'),('68','SANTANDER','68245','EL GUACAMAYO'),('68','SANTANDER','68250','EL PEÑÓN'),('68','SANTANDER','68255','EL PLAYÓN'),('68','SANTANDER','68264','ENCINO'),('68','SANTANDER','68266','ENCISO'),('68','SANTANDER','68271','FLORIÁN'),('68','SANTANDER','68276','FLORIDABLANCA'),('68','SANTANDER','68296','GALÁN'),('68','SANTANDER','68298','GÁMBITA'),('68','SANTANDER','68307','GIRÓN'),('68','SANTANDER','68318','GUACA'),('68','SANTANDER','68320','GUADALUPE'),('68','SANTANDER','68322','GUAPOTÁ'),('68','SANTANDER','68324','GUAVATÁ'),('68','SANTANDER','68327','GÜEPSA'),('68','SANTANDER','68344','HATO'),('68','SANTANDER','68368','JESÚS MARÍA'),('68','SANTANDER','68370','JORDÁN'),('68','SANTANDER','68377','LA BELLEZA'),('68','SANTANDER','68385','LANDÁZURI'),('68','SANTANDER','68397','LA PAZ'),('68','SANTANDER','68406','LEBRIJA'),('68','SANTANDER','68418','LOS SANTOS'),('68','SANTANDER','68425','MACARAVITA'),('68','SANTANDER','68432','MÁLAGA'),('68','SANTANDER','68444','MATANZA'),('68','SANTANDER','68464','MOGOTES'),('68','SANTANDER','68468','MOLAGAVITA'),('68','SANTANDER','68498','OCAMONTE'),('68','SANTANDER','68500','OIBA'),('68','SANTANDER','68502','ONZAGA'),('68','SANTANDER','68522','PALMAR'),('68','SANTANDER','68524','PALMAS DEL SOCORRO'),('68','SANTANDER','68533','PÁRAMO'),('68','SANTANDER','68547','PIEDECUESTA'),('68','SANTANDER','68549','PINCHOTE'),('68','SANTANDER','68572','PUENTE NACIONAL'),('68','SANTANDER','68573','PUERTO PARRA'),('68','SANTANDER','68575','PUERTO WILCHES'),('68','SANTANDER','68615','RIONEGRO'),('68','SANTANDER','68655','SABANA DE TORRES'),('68','SANTANDER','68669','SAN ANDRÉS'),('68','SANTANDER','68673','SAN BENITO'),('68','SANTANDER','68679','SAN GIL'),('68','SANTANDER','68682','SAN JOAQUÍN'),('68','SANTANDER','68684','SAN JOSÉ DE MIRANDA'),('68','SANTANDER','68686','SAN MIGUEL'),('68','SANTANDER','68705','SANTA BÁRBARA'),('68','SANTANDER','68720','SANTA HELENA DEL OPÓN'),('68','SANTANDER','68689','SAN VICENTE DE CHUCURÍ'),('68','SANTANDER','68745','SIMACOTA'),('68','SANTANDER','68755','SOCORRO'),('68','SANTANDER','68770','SUAITA'),('68','SANTANDER','68773','SUCRE'),('68','SANTANDER','68780','SURATÁ'),('68','SANTANDER','68820','TONA'),('68','SANTANDER','68855','VALLE DE SAN JOSÉ'),('68','SANTANDER','68861','VÉLEZ'),('68','SANTANDER','68867','VETAS'),('68','SANTANDER','68872','VILLANUEVA'),('68','SANTANDER','68895','ZAPATOCA'),('70','SUCRE','70110','BUENAVISTA'),('70','SUCRE','70124','CAIMITO'),('70','SUCRE','70230','CHALÁN'),('70','SUCRE','70204','COLOSÓ'),('70','SUCRE','70215','COROZAL'),('70','SUCRE','70221','COVEÑAS'),('70','SUCRE','70233','EL ROBLE'),('70','SUCRE','70235','GALERAS'),('70','SUCRE','70265','GUARANDA'),('70','SUCRE','70400','LA UNIÓN'),('70','SUCRE','70418','LOS PALMITOS'),('70','SUCRE','70429','MAJAGUAL'),('70','SUCRE','70473','MORROA'),('70','SUCRE','70508','OVEJAS'),('70','SUCRE','70523','PALMITO'),('70','SUCRE','70670','SAMPUÉS'),('70','SUCRE','70678','SAN BENITO ABAD'),('70','SUCRE','70823','SAN JOSÉ DE TOLUVIEJO'),('70','SUCRE','70702','SAN JUAN DE BETULIA'),('70','SUCRE','70742','SAN LUIS DE SINCÉ'),('70','SUCRE','70708','SAN MARCOS'),('70','SUCRE','70713','SAN ONOFRE'),('70','SUCRE','70717','SAN PEDRO'),('70','SUCRE','70820','SANTIAGO DE TOLÚ'),('70','SUCRE','70001','SINCELEJO'),('70','SUCRE','70771','SUCRE'),('73','TOLIMA','73024','ALPUJARRA'),('73','TOLIMA','73026','ALVARADO'),('73','TOLIMA','73030','AMBALEMA'),('73','TOLIMA','73043','ANZOÁTEGUI'),('73','TOLIMA','73055','ARMERO'),('73','TOLIMA','73067','ATACO'),('73','TOLIMA','73124','CAJAMARCA'),('73','TOLIMA','73148','CARMEN DE APICALÁ'),('73','TOLIMA','73152','CASABIANCA'),('73','TOLIMA','73168','CHAPARRAL'),('73','TOLIMA','73200','COELLO'),('73','TOLIMA','73217','COYAIMA'),('73','TOLIMA','73226','CUNDAY'),('73','TOLIMA','73236','DOLORES'),('73','TOLIMA','73268','ESPINAL'),('73','TOLIMA','73270','FALAN'),('73','TOLIMA','73275','FLANDES'),('73','TOLIMA','73283','FRESNO'),('73','TOLIMA','73319','GUAMO'),('73','TOLIMA','73347','HERVEO'),('73','TOLIMA','73349','HONDA'),('73','TOLIMA','73001','IBAGUÉ'),('73','TOLIMA','73352','ICONONZO'),('73','TOLIMA','73408','LÉRIDA'),('73','TOLIMA','73411','LÍBANO'),('73','TOLIMA','73449','MELGAR'),('73','TOLIMA','73461','MURILLO'),('73','TOLIMA','73483','NATAGAIMA'),('73','TOLIMA','73504','ORTEGA'),('73','TOLIMA','73520','PALOCABILDO'),('73','TOLIMA','73547','PIEDRAS'),('73','TOLIMA','73555','PLANADAS'),('73','TOLIMA','73563','PRADO'),('73','TOLIMA','73585','PURIFICACIÓN'),('73','TOLIMA','73616','RIOBLANCO'),('73','TOLIMA','73622','RONCESVALLES'),('73','TOLIMA','73624','ROVIRA'),('73','TOLIMA','73671','SALDAÑA'),('73','TOLIMA','73675','SAN ANTONIO'),('73','TOLIMA','73678','SAN LUIS'),('73','TOLIMA','73443','SAN SEBASTIÁN DE MARIQUITA'),('73','TOLIMA','73686','SANTA ISABEL'),('73','TOLIMA','73770','SUÁREZ'),('73','TOLIMA','73854','VALLE DE SAN JUAN'),('73','TOLIMA','73861','VENADILLO'),('73','TOLIMA','73870','VILLAHERMOSA'),('73','TOLIMA','73873','VILLARRICA'),('76','VALLE DEL CAUCA','76020','ALCALÁ'),('76','VALLE DEL CAUCA','76036','ANDALUCÍA'),('76','VALLE DEL CAUCA','76041','ANSERMANUEVO'),('76','VALLE DEL CAUCA','76054','ARGELIA'),('76','VALLE DEL CAUCA','76100','BOLÍVAR'),('76','VALLE DEL CAUCA','76109','BUENAVENTURA'),('76','VALLE DEL CAUCA','76113','BUGALAGRANDE'),('76','VALLE DEL CAUCA','76122','CAICEDONIA'),('76','VALLE DEL CAUCA','76126','CALIMA'),('76','VALLE DEL CAUCA','76130','CANDELARIA'),('76','VALLE DEL CAUCA','76147','CARTAGO'),('76','VALLE DEL CAUCA','76233','DAGUA'),('76','VALLE DEL CAUCA','76243','EL ÁGUILA'),('76','VALLE DEL CAUCA','76246','EL CAIRO'),('76','VALLE DEL CAUCA','76248','EL CERRITO'),('76','VALLE DEL CAUCA','76250','EL DOVIO'),('76','VALLE DEL CAUCA','76275','FLORIDA'),('76','VALLE DEL CAUCA','76306','GINEBRA'),('76','VALLE DEL CAUCA','76318','GUACARÍ'),('76','VALLE DEL CAUCA','76111','GUADALAJARA DE BUGA'),('76','VALLE DEL CAUCA','76364','JAMUNDÍ'),('76','VALLE DEL CAUCA','76377','LA CUMBRE'),('76','VALLE DEL CAUCA','76400','LA UNIÓN'),('76','VALLE DEL CAUCA','76403','LA VICTORIA'),('76','VALLE DEL CAUCA','76497','OBANDO'),('76','VALLE DEL CAUCA','76520','PALMIRA'),('76','VALLE DEL CAUCA','76563','PRADERA'),('76','VALLE DEL CAUCA','76606','RESTREPO'),('76','VALLE DEL CAUCA','76616','RIOFRÍO'),('76','VALLE DEL CAUCA','76622','ROLDANILLO'),('76','VALLE DEL CAUCA','76670','SAN PEDRO'),('76','VALLE DEL CAUCA','76001','SANTIAGO DE CALI'),('76','VALLE DEL CAUCA','76736','SEVILLA'),('76','VALLE DEL CAUCA','76823','TORO'),('76','VALLE DEL CAUCA','76828','TRUJILLO'),('76','VALLE DEL CAUCA','76834','TULUÁ'),('76','VALLE DEL CAUCA','76845','ULLOA'),('76','VALLE DEL CAUCA','76863','VERSALLES'),('76','VALLE DEL CAUCA','76869','VIJES'),('76','VALLE DEL CAUCA','76890','YOTOCO'),('76','VALLE DEL CAUCA','76892','YUMBO'),('76','VALLE DEL CAUCA','76895','ZARZAL'),('97','VAUPÉS','97161','CARURÚ'),('97','VAUPÉS','97001','MITÚ'),('97','VAUPÉS','97511','PACOA'),('97','VAUPÉS','97777','PAPUNAHUA'),('97','VAUPÉS','97666','TARAIRA'),('97','VAUPÉS','97889','YAVARATÉ'),('99','VICHADA','99773','CUMARIBO'),('99','VICHADA','99524','LA PRIMAVERA'),('99','VICHADA','99001','PUERTO CARREÑO'),('99','VICHADA','99624','SANTA ROSALÍA');`);
      await db.execAsync(`INSERT OR IGNORE INTO components (id,name,description,raw_json) VALUES (1,'INFORMACIÓN PERSONAL',NULL,'{"name":"INFORMACIÓN PERSONAL","id":1}'),(2,'INFORMACIÓN DEL PREDIO',NULL,'{"name":"INFORMACIÓN DEL PREDIO","id":2}'),(3,'LÍNEAS PRODUCTIVAS',NULL,'{"name":"LÍNEAS PRODUCTIVAS","id":3}'),(4,'CLASIFICACIÓN',NULL,'{"name":"CLASIFICACIÓN","id":4}'),(5,'CARACTERIZACIÓN',NULL,'{"name":"CARACTERIZACIÓN","id":5}');`);
      await db.execAsync(`INSERT OR IGNORE INTO question_types (id,name) VALUES (1,'TEXTO'),(2,'FECHA'),(3,'LOGICA'),(4,'NUMERICA'),(5,'LISTA'),(6,'LISTA DEPENDIENTE'),(7,'UBICACIÓN');`);
      await db.execAsync(`INSERT OR IGNORE INTO questions (id,name,component_id,question_type_id,is_required,sort_order,raw_json) VALUES (57,'Fecha de nacimiento',1,2,1,0,'{"id":57,"component_id":1,"question_type_id":2,"description":"Fecha de nacimiento","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":71,"question_parent_id":null,"question_type_name":"FECHA","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"date_birth","options":null,"intervention_method_id":null,"intervention_method_name":null}'),(58,'¿Cuál es su sexo al nacimiento?',1,5,1,0,'{"id":58,"component_id":1,"question_type_id":5,"description":"¿Cuál es su sexo al nacimiento?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":74,"question_parent_id":null,"question_type_name":"LISTA","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"sex_at_birth","options":[{"id":208,"question_id":58,"name":"MASCULINO","value":"1","other_question_id":null},{"id":209,"question_id":58,"name":"FEMENINO","value":"2","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(2,'¿Padece usted de algún tipo de discapacidad?',1,6,1,0,'{"id":2,"component_id":1,"question_type_id":6,"description":"¿Padece usted de algún tipo de discapacidad?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":2,"question_parent_id":null,"question_type_name":"LISTA DEPENDIENTE","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"disability","options":[{"id":6,"question_id":2,"name":"SI","value":"1","other_question_id":1},{"id":7,"question_id":2,"name":"NO","value":"2","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(1,'¿Cuál discapacidad?',1,5,1,0,'{"id":1,"component_id":1,"question_type_id":5,"description":"¿Cuál discapacidad?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":3,"question_parent_id":null,"question_type_name":"LISTA","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"which_disability","options":[{"id":1,"question_id":1,"name":"Discapacidad fIsica","value":"1","other_question_id":null},{"id":2,"question_id":1,"name":"Discapacidad sensorial","value":"2","other_question_id":null},{"id":3,"question_id":1,"name":"Discapacidad intelectual","value":"3","other_question_id":null},{"id":4,"question_id":1,"name":"Discapacidad PsIquica","value":"4","other_question_id":null},{"id":5,"question_id":1,"name":"Discapacidad multiple","value":"5","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(59,'¿Cuál es su grado de escolaridad y nivel alcanzado?',1,5,1,0,'{"id":59,"component_id":1,"question_type_id":5,"description":"¿Cuál es su grado de escolaridad y nivel alcanzado?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":4,"question_parent_id":null,"question_type_name":"LISTA","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"educational_level","options":[{"id":210,"question_id":59,"name":"Ninguno","value":"1","other_question_id":null},{"id":211,"question_id":59,"name":"Primaria","value":"2","other_question_id":null},{"id":212,"question_id":59,"name":"Secundaria","value":"3","other_question_id":null},{"id":213,"question_id":59,"name":"TEcnica","value":"4","other_question_id":null},{"id":214,"question_id":59,"name":"TecnolOgica","value":"5","other_question_id":null},{"id":215,"question_id":59,"name":"Universitario","value":"6","other_question_id":null},{"id":216,"question_id":59,"name":"Posgrado","value":"7","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(3,'¿Es usted beneficiario/beneficiaria de procesos de reincorporación y/o reinserción a la sociedad civil?',1,3,1,0,'{"id":3,"component_id":1,"question_type_id":3,"description":"¿Es usted beneficiario/beneficiaria de procesos de reincorporación y/o reinserción a la sociedad civil?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":5,"question_parent_id":null,"question_type_name":"LOGICA","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"reinstatement","options":null,"intervention_method_id":null,"intervention_method_name":null}'),(4,'¿Es usted cabeza de familia?',1,3,1,0,'{"id":4,"component_id":1,"question_type_id":3,"description":"¿Es usted cabeza de familia?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":6,"question_parent_id":null,"question_type_name":"LOGICA","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"head_family","options":null,"intervention_method_id":null,"intervention_method_name":null}'),(5,'¿Cuántas personas conviven en el predio con el  usuario/usuaria que se registra?',1,4,1,0,'{"id":5,"component_id":1,"question_type_id":4,"description":"¿Cuántas personas conviven en el predio con el  usuario/usuaria que se registra?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":7,"question_parent_id":null,"question_type_name":"NUMERICA","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"people_live_property_user","options":null,"intervention_method_id":null,"intervention_method_name":null}'),(60,'Teléfono celular o fijo de contacto',1,1,1,0,'{"id":60,"component_id":1,"question_type_id":1,"description":"Teléfono celular o fijo de contacto","active":true,"multiple":false,"required":true,"levels":null,"maxlength":"20","field_innova_id":72,"question_parent_id":null,"question_type_name":"TEXTO","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"phone","options":null,"intervention_method_id":null,"intervention_method_name":null}'),(61,'Dirección de correo electrónico',1,1,1,0,'{"id":61,"component_id":1,"question_type_id":1,"description":"Dirección de correo electrónico","active":true,"multiple":false,"required":true,"levels":null,"maxlength":"255","field_innova_id":73,"question_parent_id":null,"question_type_name":"TEXTO","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"email","options":null,"intervention_method_id":null,"intervention_method_name":null}'),(6,'Pertenencia étnica',1,5,1,0,'{"id":6,"component_id":1,"question_type_id":5,"description":"Pertenencia étnica","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":16,"question_parent_id":null,"question_type_name":"LISTA","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"ethnicity","options":[{"id":8,"question_id":6,"name":"IndIgena","value":"1","other_question_id":null},{"id":9,"question_id":6,"name":"Gitano(a) Rom","value":"2","other_question_id":null},{"id":10,"question_id":6,"name":"Mulato(a)","value":"3","other_question_id":null},{"id":11,"question_id":6,"name":"NARP - Negro(a), afrodescenciente, afrocolombiano(a), raizal, palenquero(a)","value":"4","other_question_id":null},{"id":12,"question_id":6,"name":"Ninguna de las anteriores","value":"5","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(7,'Usted accede a internet de la siguiente forma',1,5,1,0,'{"id":7,"component_id":1,"question_type_id":5,"description":"Usted accede a internet de la siguiente forma","active":true,"multiple":true,"required":true,"levels":null,"maxlength":null,"field_innova_id":20,"question_parent_id":null,"question_type_name":"LISTA","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"access_internet","options":[{"id":13,"question_id":7,"name":"Vivienda Familiar","value":"1","other_question_id":null},{"id":14,"question_id":7,"name":"Colegios - Escuelas - Bibliotecas","value":"2","other_question_id":null},{"id":15,"question_id":7,"name":"Zonas Wifi","value":"3","other_question_id":null},{"id":16,"question_id":7,"name":"Establecimientos de servicios de internet","value":"4","other_question_id":null},{"id":17,"question_id":7,"name":"Servicio particular de internet","value":"5","other_question_id":null},{"id":18,"question_id":7,"name":"Red directa - Plan de datos - Celular","value":"6","other_question_id":null},{"id":19,"question_id":7,"name":"Vive digital","value":"7","other_question_id":null},{"id":20,"question_id":7,"name":"No accede","value":"8","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(8,'¿Pertenece usted a alguna figura colectiva?',1,6,1,0,'{"id":8,"component_id":1,"question_type_id":6,"description":"¿Pertenece usted a alguna figura colectiva?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":23,"question_parent_id":null,"question_type_name":"LISTA DEPENDIENTE","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"belong_collective_figure","options":[{"id":21,"question_id":8,"name":"Cooperativas","value":"1","other_question_id":10},{"id":30,"question_id":8,"name":"Organizaciones comunitarias de ancianos o de jOvenes","value":"10","other_question_id":10},{"id":31,"question_id":8,"name":"No pertenece a ninguna asociaciOn","value":"11","other_question_id":null},{"id":32,"question_id":8,"name":"No sabe / No responde","value":"12","other_question_id":null},{"id":33,"question_id":8,"name":"Otra","value":"13","other_question_id":null},{"id":22,"question_id":8,"name":"Gremios","value":"2","other_question_id":10},{"id":23,"question_id":8,"name":"AsociaciOn de productores","value":"3","other_question_id":10},{"id":24,"question_id":8,"name":"Centros de investigaciOn","value":"4","other_question_id":10},{"id":25,"question_id":8,"name":"Consejo comunitario","value":"5","other_question_id":10},{"id":26,"question_id":8,"name":"JAC","value":"6","other_question_id":10},{"id":27,"question_id":8,"name":"JAL","value":"7","other_question_id":10},{"id":28,"question_id":8,"name":"AsociaciOn y organizaciOn Etnica","value":"8","other_question_id":10},{"id":29,"question_id":8,"name":"Organizaciones comunitarias de mujeres","value":"9","other_question_id":10}],"intervention_method_id":null,"intervention_method_name":null}'),(10,'¿La figura Colectiva a la que pertenece está legalmente constituida?',1,6,1,0,'{"id":10,"component_id":1,"question_type_id":6,"description":"¿La figura Colectiva a la que pertenece está legalmente constituida?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":25,"question_parent_id":null,"question_type_name":"LISTA DEPENDIENTE","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"legal_collective_figure","options":[{"id":34,"question_id":10,"name":"SI","value":"1","other_question_id":9},{"id":35,"question_id":10,"name":"NO","value":"2","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(9,'¿Cuál es el nombre de la organización?',1,1,1,0,'{"id":9,"component_id":1,"question_type_id":1,"description":"¿Cuál es el nombre de la organización?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":"20","field_innova_id":26,"question_parent_id":null,"question_type_name":"TEXTO","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"name_collective_figure","options":null,"intervention_method_id":null,"intervention_method_name":null}'),(11,'¿Ha accedido a recursos financieros a través de entidades financieras, asociaciones, cooperativas?:*',1,5,1,0,'{"id":11,"component_id":1,"question_type_id":5,"description":"¿Ha accedido a recursos financieros a través de entidades financieras, asociaciones, cooperativas?:*","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":32,"question_parent_id":null,"question_type_name":"LISTA","component_name":"INFORMACIÓN PERSONAL","field_innova_name":"access_economic_resources","options":[{"id":36,"question_id":11,"name":"LEC-A toda mAquina e infraestructura","value":"1","other_question_id":null},{"id":45,"question_id":11,"name":"LEC-Sostenibilidad agropecuaria y NegociosVerdes","value":"10","other_question_id":null},{"id":46,"question_id":11,"name":"PoblaciOn en situaciOn especial(VIctimas, reinsertados)","value":"11","other_question_id":null},{"id":47,"question_id":11,"name":"Ninguno","value":"12","other_question_id":null},{"id":48,"question_id":11,"name":"Otra","value":"13","other_question_id":null},{"id":37,"question_id":11,"name":"LEC-Compra de tierras de uso agropecuario","value":"2","other_question_id":null},{"id":38,"question_id":11,"name":"LEC-InclusiOn financiera","value":"3","other_question_id":null},{"id":39,"question_id":11,"name":"LEC-Comunidades Negras, Afrodescendientes, raizalez y palenqueras","value":"4","other_question_id":null},{"id":40,"question_id":11,"name":"LEC-Mujer rural y joven rural","value":"5","other_question_id":null},{"id":41,"question_id":11,"name":"LEC-SustituciOn","value":"6","other_question_id":null},{"id":42,"question_id":11,"name":"LEC-Sectores estratEgicos","value":"7","other_question_id":null},{"id":43,"question_id":11,"name":"LEC-ReactivaciOn productiva-Afectaciones climAticas","value":"8","other_question_id":null},{"id":44,"question_id":11,"name":"LEC-Agricultura por contrato","value":"9","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(17,'Nombre del predio o finca',2,1,1,0,'{"id":17,"component_id":2,"question_type_id":1,"description":"Nombre del predio o finca","active":true,"multiple":false,"required":true,"levels":null,"maxlength":"255","field_innova_id":36,"question_parent_id":null,"question_type_name":"TEXTO","component_name":"INFORMACIÓN DEL PREDIO","field_innova_name":"name_property","options":null,"intervention_method_id":null,"intervention_method_name":null}'),(18,'Ubicación del predio',2,7,1,0,'{"id":18,"component_id":2,"question_type_id":7,"description":"Ubicación del predio","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":38,"question_parent_id":null,"question_type_name":"UBICACIÓN","component_name":"INFORMACIÓN DEL PREDIO","field_innova_name":"municipality_id","options":null,"intervention_method_id":null,"intervention_method_name":null}'),(19,'Nombre de vereda',2,1,1,0,'{"id":19,"component_id":2,"question_type_id":1,"description":"Nombre de vereda","active":true,"multiple":false,"required":true,"levels":null,"maxlength":"255","field_innova_id":40,"question_parent_id":null,"question_type_name":"TEXTO","component_name":"INFORMACIÓN DEL PREDIO","field_innova_name":"sidewalk","options":null,"intervention_method_id":null,"intervention_method_name":null}'),(20,'¿Cuál es la figura de tenencia del predio en el que se prestará el servicio público de extensión agropecuaria?',2,5,1,0,'{"id":20,"component_id":2,"question_type_id":5,"description":"¿Cuál es la figura de tenencia del predio en el que se prestará el servicio público de extensión agropecuaria?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":42,"question_parent_id":null,"question_type_name":"LISTA","component_name":"INFORMACIÓN DEL PREDIO","field_innova_name":"tenure_property","options":[{"id":52,"question_id":20,"name":"Propio sin tItulo","value":"1","other_question_id":null},{"id":53,"question_id":20,"name":"Propio con tItulo","value":"2","other_question_id":null},{"id":54,"question_id":20,"name":"En Arriendo o subarriendo","value":"3","other_question_id":null},{"id":55,"question_id":20,"name":"AparcerIa","value":"4","other_question_id":null},{"id":56,"question_id":20,"name":"En usufructo","value":"5","other_question_id":null},{"id":57,"question_id":20,"name":"En sucesiOn con tItulo","value":"6","other_question_id":null},{"id":58,"question_id":20,"name":"En sucesiOn sin tItulo","value":"7","other_question_id":null},{"id":59,"question_id":20,"name":"Propiedad colectiva","value":"8","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(21,'¿Cuál es el área total de su predio en metros cuadrados (m2)?',2,4,1,0,'{"id":21,"component_id":2,"question_type_id":4,"description":"¿Cuál es el área total de su predio en metros cuadrados (m2)?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":44,"question_parent_id":null,"question_type_name":"NUMERICA","component_name":"INFORMACIÓN DEL PREDIO","field_innova_name":"total_property_area","options":null,"intervention_method_id":null,"intervention_method_name":null}'),(22,'¿Con cuáles de estos servicios domésticos cuenta su predio?',2,5,1,0,'{"id":22,"component_id":2,"question_type_id":5,"description":"¿Con cuáles de estos servicios domésticos cuenta su predio?","active":true,"multiple":true,"required":true,"levels":null,"maxlength":null,"field_innova_id":48,"question_parent_id":null,"question_type_name":"LISTA","component_name":"INFORMACIÓN DEL PREDIO","field_innova_name":"domestic_services","options":[{"id":60,"question_id":22,"name":"Interconexión Eléctrica","value":"1","other_question_id":null},{"id":69,"question_id":22,"name":"Internet","value":"10","other_question_id":null},{"id":61,"question_id":22,"name":"Energía Fotovoltaica o eólica","value":"2","other_question_id":null},{"id":62,"question_id":22,"name":"Gas domiciliario","value":"3","other_question_id":null},{"id":63,"question_id":22,"name":"Biogas","value":"4","other_question_id":null},{"id":64,"question_id":22,"name":"Unidad Sanitaria","value":"5","other_question_id":null},{"id":65,"question_id":22,"name":"Pozo sético","value":"6","other_question_id":null},{"id":66,"question_id":22,"name":"Señal de telefonía movil","value":"7","other_question_id":null},{"id":67,"question_id":22,"name":"Acueducto","value":"8","other_question_id":null},{"id":68,"question_id":22,"name":"Sistema de Riego","value":"9","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(23,'¿Con qué tipos de acceso vial cuenta su predio?',2,5,1,0,'{"id":23,"component_id":2,"question_type_id":5,"description":"¿Con qué tipos de acceso vial cuenta su predio?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":49,"question_parent_id":null,"question_type_name":"LISTA","component_name":"INFORMACIÓN DEL PREDIO","field_innova_name":"road_access","options":[{"id":70,"question_id":23,"name":"Via sin pavimentar","value":"1","other_question_id":null},{"id":71,"question_id":23,"name":"Sendero","value":"2","other_question_id":null},{"id":72,"question_id":23,"name":"Carretera","value":"3","other_question_id":null},{"id":73,"question_id":23,"name":"Fluivial","value":"4","other_question_id":null},{"id":74,"question_id":23,"name":"Otro","value":"5","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(24,'¿Cuál es el medio de transporte que usa para llegar a la cabecera municipal?',2,5,1,0,'{"id":24,"component_id":2,"question_type_id":5,"description":"¿Cuál es el medio de transporte que usa para llegar a la cabecera municipal?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":51,"question_parent_id":null,"question_type_name":"LISTA","component_name":"INFORMACIÓN DEL PREDIO","field_innova_name":"conveyance","options":[{"id":75,"question_id":24,"name":"AutomOvil","value":"1","other_question_id":null},{"id":76,"question_id":24,"name":"Moto","value":"2","other_question_id":null},{"id":77,"question_id":24,"name":"Bicicleta","value":"3","other_question_id":null},{"id":78,"question_id":24,"name":"Transporte animal","value":"4","other_question_id":null},{"id":79,"question_id":24,"name":"Transporte pUblico","value":"5","other_question_id":null},{"id":80,"question_id":24,"name":"Transporte aEreo","value":"6","other_question_id":null},{"id":81,"question_id":24,"name":"Transporte fluvial","value":"7","other_question_id":null},{"id":82,"question_id":24,"name":"Ninguno","value":"8","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(25,'¿Cuánto tiempo tarda en llegar desde su predio a la cabecera municipal?',2,5,1,0,'{"id":25,"component_id":2,"question_type_id":5,"description":"¿Cuánto tiempo tarda en llegar desde su predio a la cabecera municipal?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":52,"question_parent_id":null,"question_type_name":"LISTA","component_name":"INFORMACIÓN DEL PREDIO","field_innova_name":"municipal_arrival_time","options":[{"id":83,"question_id":25,"name":"Hasta 30 minutos","value":"1","other_question_id":null},{"id":84,"question_id":25,"name":"Entre 31 minutos y 1 hora y 30 minutos","value":"2","other_question_id":null},{"id":85,"question_id":25,"name":"MAs de 1 1/2 horas","value":"3","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(62,'¿Cuál es la unidad de medida del área productiva?',3,5,1,0,'{"id":62,"component_id":3,"question_type_id":5,"description":"¿Cuál es la unidad de medida del área productiva?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":57,"question_parent_id":null,"question_type_name":"LISTA","component_name":"LÍNEAS PRODUCTIVAS","field_innova_name":"production_lines_which","options":[{"id":217,"question_id":62,"name":"Kilos","value":"1","other_question_id":null},{"id":218,"question_id":62,"name":"Toneladas","value":"2","other_question_id":null},{"id":219,"question_id":62,"name":"Litros","value":"3","other_question_id":null},{"id":220,"question_id":62,"name":"Cargas","value":"4","other_question_id":null},{"id":221,"question_id":62,"name":"Arrobas","value":"5","other_question_id":null},{"id":222,"question_id":62,"name":"Bultos","value":"6","other_question_id":null},{"id":223,"question_id":62,"name":"Atados","value":"7","other_question_id":null},{"id":224,"question_id":62,"name":"Galones","value":"8","other_question_id":null},{"id":225,"question_id":62,"name":"Cubetas","value":"9","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(63,'¿Dónde vende la mayoría de sus productos?',3,5,1,0,'{"id":63,"component_id":3,"question_type_id":5,"description":"¿Dónde vende la mayoría de sus productos?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":60,"question_parent_id":null,"question_type_name":"LISTA","component_name":"LÍNEAS PRODUCTIVAS","field_innova_name":"sell_most_products","options":[{"id":226,"question_id":63,"name":"Plazas de mercado","value":"1","other_question_id":null},{"id":235,"question_id":63,"name":"Exportadores","value":"10","other_question_id":null},{"id":236,"question_id":63,"name":"Mayoristas","value":"11","other_question_id":null},{"id":237,"question_id":63,"name":"Almacenes de cadena grandes superficies","value":"12","other_question_id":null},{"id":238,"question_id":63,"name":"Ninguna","value":"13","other_question_id":null},{"id":239,"question_id":63,"name":"Otro","value":"14","other_question_id":null},{"id":227,"question_id":63,"name":"Intermediarios","value":"2","other_question_id":null},{"id":228,"question_id":63,"name":"Empresas","value":"3","other_question_id":null},{"id":229,"question_id":63,"name":"Mercados Campesinos","value":"4","other_question_id":null},{"id":230,"question_id":63,"name":"Compras públicas","value":"5","other_question_id":null},{"id":231,"question_id":63,"name":"Tiendas","value":"6","other_question_id":null},{"id":232,"question_id":63,"name":"Consumidor directo","value":"7","other_question_id":null},{"id":233,"question_id":63,"name":"Cooperativas","value":"8","other_question_id":null},{"id":234,"question_id":63,"name":"Gremios","value":"9","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(64,'¿Actualmente es usted usuario/usuaria de algún servicio de asistencia técnica y/o extensión agropecuaria?',3,3,1,0,'{"id":64,"component_id":3,"question_type_id":3,"description":"¿Actualmente es usted usuario/usuaria de algún servicio de asistencia técnica y/o extensión agropecuaria?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":"255","field_innova_id":67,"question_parent_id":null,"question_type_name":"LOGICA","component_name":"LÍNEAS PRODUCTIVAS","field_innova_name":"agricultural_assistance_user","options":null,"intervention_method_id":null,"intervention_method_name":null}'),(65,'¿Cómo ha recibido asistencia técnica?',3,1,1,0,'{"id":65,"component_id":3,"question_type_id":1,"description":"¿Cómo ha recibido asistencia técnica?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":"255","field_innova_id":68,"question_parent_id":null,"question_type_name":"TEXTO","component_name":"LÍNEAS PRODUCTIVAS","field_innova_name":"assistance_how","options":null,"intervention_method_id":null,"intervention_method_name":null}'),(26,'Identificación de la actividad productiva principal. Este componente busca identificar qué sistema productivo predomina en la unidad productiva del usuario',4,5,1,0,'{"id":26,"component_id":4,"question_type_id":5,"description":"Identificación de la actividad productiva principal. Este componente busca identificar qué sistema productivo predomina en la unidad productiva del usuario","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":86,"question_id":26,"name":"Sis. productivo integrado, subsistencia - ACFEC","value":"1","other_question_id":null},{"id":87,"question_id":26,"name":"Tradicional","value":"2","other_question_id":null},{"id":88,"question_id":26,"name":"No Tradicional especializado","value":"3","other_question_id":null},{"id":89,"question_id":26,"name":"Agronegocio","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(27,'Identificación de actividades productivas secundarias. Este componente busca identificar si el productor tiene actividades productivas secundarias y en caso de tenerlas, qué enfoque o proyección presentan. Y como aportan en la generación de ingresos de su sistema productivo principal',4,5,1,0,'{"id":27,"component_id":4,"question_type_id":5,"description":"Identificación de actividades productivas secundarias. Este componente busca identificar si el productor tiene actividades productivas secundarias y en caso de tenerlas, qué enfoque o proyección presentan. Y como aportan en la generación de ingresos de su sistema productivo principal","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":90,"question_id":27,"name":"No tiene","value":"1","other_question_id":null},{"id":91,"question_id":27,"name":"Ocasional","value":"2","other_question_id":null},{"id":92,"question_id":27,"name":"Frecuente","value":"3","other_question_id":null},{"id":93,"question_id":27,"name":"Permanente e integrada","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(28,'Tipo de herramientas y equipos empleados en el proceso productivo Este componente busca evaluar el tipo de acceso del productor, a las herramientas y equipos empleados en su sistema productivo. El acceso se refiere a la disponibilidad y disposición para el uso acordes a sus necesidades y demandas.',4,5,1,0,'{"id":28,"component_id":4,"question_type_id":5,"description":"Tipo de herramientas y equipos empleados en el proceso productivo Este componente busca evaluar el tipo de acceso del productor, a las herramientas y equipos empleados en su sistema productivo. El acceso se refiere a la disponibilidad y disposición para el uso acordes a sus necesidades y demandas.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":94,"question_id":28,"name":"Acceso restringido","value":"1","other_question_id":null},{"id":95,"question_id":28,"name":"Acceso Limitado","value":"2","other_question_id":null},{"id":96,"question_id":28,"name":"Acceso común","value":"3","other_question_id":null},{"id":97,"question_id":28,"name":"Acceso especializado","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(29,'Uso de Buenas prácticas Agrícolas y Ganaderas Este componente busca clasificar al productor con respecto al conocimiento, aplicación, implementación y certificación de las Buenas Prácticas en su sistema productivo. También se considera dentro de esta clasificación, los conocimientos y formación en el tema, del personal vinculado al sistema productivo.',4,5,1,0,'{"id":29,"component_id":4,"question_type_id":5,"description":"Uso de Buenas prácticas Agrícolas y Ganaderas Este componente busca clasificar al productor con respecto al conocimiento, aplicación, implementación y certificación de las Buenas Prácticas en su sistema productivo. También se considera dentro de esta clasificación, los conocimientos y formación en el tema, del personal vinculado al sistema productivo.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":98,"question_id":29,"name":"Desconoce","value":"1","other_question_id":null},{"id":99,"question_id":29,"name":"Conoce parcialmente","value":"2","other_question_id":null},{"id":100,"question_id":29,"name":"Conoce y aplica","value":"3","other_question_id":null},{"id":101,"question_id":29,"name":"Productor certificado","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(30,'Estructuras de comercialización de los productos Este componente busca identificar de qué forma comercializa el productor, en términos de planificación y especialización.',4,5,1,0,'{"id":30,"component_id":4,"question_type_id":5,"description":"Estructuras de comercialización de los productos Este componente busca identificar de qué forma comercializa el productor, en términos de planificación y especialización.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":102,"question_id":30,"name":"Autoconsumo y/o no planificada","value":"1","other_question_id":null},{"id":103,"question_id":30,"name":"Tradicional","value":"2","other_question_id":null},{"id":104,"question_id":30,"name":"Planificado tradicional","value":"3","other_question_id":null},{"id":105,"question_id":30,"name":"Planificada especializada","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(31,'Mercados. Este componente busca identificar el destino de mercado de los productos y el grado de especialización en el ejercicio de la comercialización',4,5,1,0,'{"id":31,"component_id":4,"question_type_id":5,"description":"Mercados. Este componente busca identificar el destino de mercado de los productos y el grado de especialización en el ejercicio de la comercialización","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":106,"question_id":31,"name":"Local","value":"1","other_question_id":null},{"id":107,"question_id":31,"name":"Básico","value":"2","other_question_id":null},{"id":108,"question_id":31,"name":"Tradicional","value":"3","other_question_id":null},{"id":109,"question_id":31,"name":"Especializado","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(32,'Valor agregado en los procesos de producción Este componente busca identificar si el productor da algún valor agregado a su producto y en qué nivel, en términos de tratamiento de los productos primarios y de su transformación, y de la infraestructura requerida para estos procesos',4,5,1,0,'{"id":32,"component_id":4,"question_type_id":5,"description":"Valor agregado en los procesos de producción Este componente busca identificar si el productor da algún valor agregado a su producto y en qué nivel, en términos de tratamiento de los productos primarios y de su transformación, y de la infraestructura requerida para estos procesos","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":110,"question_id":32,"name":"Ninguno","value":"1","other_question_id":null},{"id":111,"question_id":32,"name":"Básico por demanda","value":"2","other_question_id":null},{"id":112,"question_id":32,"name":"Avanzado","value":"3","other_question_id":null},{"id":113,"question_id":32,"name":"Especializado","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(33,'Registros. Este componente busca identificar si el productor lleva registros del sistema productivo y en qué nivel de organización.',4,5,1,0,'{"id":33,"component_id":4,"question_type_id":5,"description":"Registros. Este componente busca identificar si el productor lleva registros del sistema productivo y en qué nivel de organización.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":114,"question_id":33,"name":"No lleva registros","value":"1","other_question_id":null},{"id":115,"question_id":33,"name":"Básico","value":"2","other_question_id":null},{"id":116,"question_id":33,"name":"Manual","value":"3","other_question_id":null},{"id":117,"question_id":33,"name":"Sistematizado","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(34,'Tipo de mano de obra empleada Este componente busca identificar el tipo de mano de obra empleada en el sistema de producción y su tipo de vinculación y remuneración.',4,5,1,0,'{"id":34,"component_id":4,"question_type_id":5,"description":"Tipo de mano de obra empleada Este componente busca identificar el tipo de mano de obra empleada en el sistema de producción y su tipo de vinculación y remuneración.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":118,"question_id":34,"name":"Por cuenta propia","value":"1","other_question_id":null},{"id":119,"question_id":34,"name":"Informal","value":"2","other_question_id":null},{"id":120,"question_id":34,"name":"Formal sin estructura administrativa","value":"3","other_question_id":null},{"id":121,"question_id":34,"name":"Formal con estructura administrativa","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(35,'Acceso a Crédito y Bancarización. Este componente busca identificar si el productor tiene acceso a crédito para fines productivos.',4,5,1,0,'{"id":35,"component_id":4,"question_type_id":5,"description":"Acceso a Crédito y Bancarización. Este componente busca identificar si el productor tiene acceso a crédito para fines productivos.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":122,"question_id":35,"name":"Excluido/informal","value":"1","other_question_id":null},{"id":123,"question_id":35,"name":"Formal no bancarizado","value":"2","other_question_id":null},{"id":124,"question_id":35,"name":"Formalizado bancarizado","value":"3","other_question_id":null},{"id":125,"question_id":35,"name":"Formal enfocado al crecimiento del negocio","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(36,'Vinculación a algún tipo de organización Este componente busca identificar si el productor está vinculado a algún tipo de organización.',4,5,1,0,'{"id":36,"component_id":4,"question_type_id":5,"description":"Vinculación a algún tipo de organización Este componente busca identificar si el productor está vinculado a algún tipo de organización.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":126,"question_id":36,"name":"No interesado","value":"1","other_question_id":null},{"id":127,"question_id":36,"name":"Vinculado","value":"2","other_question_id":null},{"id":128,"question_id":36,"name":"Sin participación","value":"3","other_question_id":null},{"id":129,"question_id":36,"name":"Si, activo","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(37,'Realización de actividades productivas de manera colectiva Este componente busca identificar la realización de actividades productivas y de gestión, de forma colectiva o conjunta por parte del productor en su entorno productivo',4,5,1,0,'{"id":37,"component_id":4,"question_type_id":5,"description":"Realización de actividades productivas de manera colectiva Este componente busca identificar la realización de actividades productivas y de gestión, de forma colectiva o conjunta por parte del productor en su entorno productivo","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":130,"question_id":37,"name":"Sin participación","value":"1","other_question_id":null},{"id":131,"question_id":37,"name":"Eventual","value":"2","other_question_id":null},{"id":132,"question_id":37,"name":"Frecuente","value":"3","other_question_id":null},{"id":133,"question_id":37,"name":"Activo","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(38,'Procesos de emprendimiento y asociatividad. Este componente busca identificar la participación del productor en procesos de emprendimiento y asociatividad, con el fin mejorar su proceso productivo, acceder a mejores alternativas de comercialización, entre otras metas, desde el punto de vista individual y organizacional. procesos',4,5,1,0,'{"id":38,"component_id":4,"question_type_id":5,"description":"Procesos de emprendimiento y asociatividad. Este componente busca identificar la participación del productor en procesos de emprendimiento y asociatividad, con el fin mejorar su proceso productivo, acceder a mejores alternativas de comercialización, entre otras metas, desde el punto de vista individual y organizacional. procesos","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":134,"question_id":38,"name":"Sin participación","value":"1","other_question_id":null},{"id":135,"question_id":38,"name":"Individual","value":"2","other_question_id":null},{"id":136,"question_id":38,"name":"Colectiva sin organización","value":"3","other_question_id":null},{"id":137,"question_id":38,"name":"Colectivo/organizado","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(39,'Participación en alianzas comerciales Este componente busca identificar la participación formal del productor en alianzas comerciales y la articulación con los eslabones de la cadena productiva. ',4,5,1,0,'{"id":39,"component_id":4,"question_type_id":5,"description":"Participación en alianzas comerciales Este componente busca identificar la participación formal del productor en alianzas comerciales y la articulación con los eslabones de la cadena productiva. ","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":138,"question_id":39,"name":"No participa","value":"1","other_question_id":null},{"id":139,"question_id":39,"name":"No formal","value":"2","other_question_id":null},{"id":140,"question_id":39,"name":"Formal esporádica","value":"3","other_question_id":null},{"id":141,"question_id":39,"name":"Formal y continua","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(40,'Acceso a apoyo técnico para el manejo de su sistema productivo Este componente busca determinar si el productor o su asociación acceden a asistencia técnica o extensión agropecuaria/rural de manera individual, colectiva, así como la frecuencia y especialización de esta. ',4,5,1,0,'{"id":40,"component_id":4,"question_type_id":5,"description":"Acceso a apoyo técnico para el manejo de su sistema productivo Este componente busca determinar si el productor o su asociación acceden a asistencia técnica o extensión agropecuaria/rural de manera individual, colectiva, así como la frecuencia y especialización de esta. ","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":142,"question_id":40,"name":"Sin acceso","value":"1","other_question_id":null},{"id":143,"question_id":40,"name":"Con acceso de baja pertinencia y cobertura","value":"2","other_question_id":null},{"id":144,"question_id":40,"name":"Colectiva","value":"3","other_question_id":null},{"id":145,"question_id":40,"name":"Permanente y especializada","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(41,'Uso de Sellos de Calidad y certificaciones. Este componente busca establecer el conocimiento, interés y uso de las certificaciones de calidad para acceder a mercados especializados. ',4,5,1,0,'{"id":41,"component_id":4,"question_type_id":5,"description":"Uso de Sellos de Calidad y certificaciones. Este componente busca establecer el conocimiento, interés y uso de las certificaciones de calidad para acceder a mercados especializados. ","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":146,"question_id":41,"name":"No conoce","value":"1","other_question_id":null},{"id":147,"question_id":41,"name":"Sin Interés","value":"2","other_question_id":null},{"id":148,"question_id":41,"name":"En proceso","value":"3","other_question_id":null},{"id":149,"question_id":41,"name":"Certificado","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(42,'Conocimientos sobre propiedad intelectual. Este componente busca establecer el conocimiento sobre los procesos de propiedad intelectual, en el desarrollo de la actividad productiva y sus productos.',4,5,1,0,'{"id":42,"component_id":4,"question_type_id":5,"description":"Conocimientos sobre propiedad intelectual. Este componente busca establecer el conocimiento sobre los procesos de propiedad intelectual, en el desarrollo de la actividad productiva y sus productos.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":150,"question_id":42,"name":"No conoce","value":"1","other_question_id":null},{"id":151,"question_id":42,"name":"Con nociones","value":"2","other_question_id":null},{"id":152,"question_id":42,"name":"Reconoce","value":"3","other_question_id":null},{"id":153,"question_id":42,"name":"Aplica","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(43,'Acceso a fuentes de información. Este componente busca establecer qué acceso tiene el productor a diferentes fuentes y medios de comunicación para el aprovechamiento y aplicación en su sistema productivo.',4,5,1,0,'{"id":43,"component_id":4,"question_type_id":5,"description":"Acceso a fuentes de información. Este componente busca establecer qué acceso tiene el productor a diferentes fuentes y medios de comunicación para el aprovechamiento y aplicación en su sistema productivo.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":154,"question_id":43,"name":"Pocas","value":"1","other_question_id":null},{"id":155,"question_id":43,"name":"Algunas","value":"2","other_question_id":null},{"id":156,"question_id":43,"name":"Mayoría de fuentes","value":"3","other_question_id":null},{"id":157,"question_id":43,"name":"Todas las fuentes","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(44,'Acceso a las TIC. Este componente busca determinar qué grado, frecuencia y tipos de tecnologías de la información y comunicación, posee o tiene acceso el productor para fines de su sistema productivo.',4,5,1,0,'{"id":44,"component_id":4,"question_type_id":5,"description":"Acceso a las TIC. Este componente busca determinar qué grado, frecuencia y tipos de tecnologías de la información y comunicación, posee o tiene acceso el productor para fines de su sistema productivo.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":158,"question_id":44,"name":"Ninguno","value":"1","other_question_id":null},{"id":159,"question_id":44,"name":"Regular","value":"2","other_question_id":null},{"id":160,"question_id":44,"name":"Frecuente","value":"3","other_question_id":null},{"id":161,"question_id":44,"name":"Permanente","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(45,'Uso de las TIC como herramientas para la toma de decisiones. Este componente busca identificar el uso y frecuencia a las tecnologías de la información y comunicación para la toma de decisiones del sistema productivo',4,5,1,0,'{"id":45,"component_id":4,"question_type_id":5,"description":"Uso de las TIC como herramientas para la toma de decisiones. Este componente busca identificar el uso y frecuencia a las tecnologías de la información y comunicación para la toma de decisiones del sistema productivo","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":162,"question_id":45,"name":"Sin acceso","value":"1","other_question_id":null},{"id":163,"question_id":45,"name":"Ninguna","value":"2","other_question_id":null},{"id":164,"question_id":45,"name":"Regular","value":"3","other_question_id":null},{"id":165,"question_id":45,"name":"Frecuente","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(46,'Habilidades y competencias en el uso de TIC. Este componente busca identificar los conocimientos, la formación y la aplicación de las tecnologías de la información y la comunicación para fines de su sistema productivo. ',4,5,1,0,'{"id":46,"component_id":4,"question_type_id":5,"description":"Habilidades y competencias en el uso de TIC. Este componente busca identificar los conocimientos, la formación y la aplicación de las tecnologías de la información y la comunicación para fines de su sistema productivo. ","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":166,"question_id":46,"name":"Ninguna","value":"1","other_question_id":null},{"id":167,"question_id":46,"name":"Básica","value":"2","other_question_id":null},{"id":168,"question_id":46,"name":"Intermedia","value":"3","other_question_id":null},{"id":169,"question_id":46,"name":"Avanzado","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(47,'Apropiación social del conocimiento Tradicional y Científico. Este componente busca determinar el grado de apropiación del conocimiento tradicional y científico del productor, valorando sus conocimientos tradicionales o ancestrales. ',4,5,1,0,'{"id":47,"component_id":4,"question_type_id":5,"description":"Apropiación social del conocimiento Tradicional y Científico. Este componente busca determinar el grado de apropiación del conocimiento tradicional y científico del productor, valorando sus conocimientos tradicionales o ancestrales. ","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":170,"question_id":47,"name":"Bajo","value":"1","other_question_id":null},{"id":171,"question_id":47,"name":"Intermedio","value":"2","other_question_id":null},{"id":172,"question_id":47,"name":"Alto","value":"3","other_question_id":null},{"id":173,"question_id":47,"name":"Avanzado","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(48,'Prácticas de manejo y conservación del medio ambiente y de la biodiversidad Este componente busca identificar qué prácticas de conservación de la biodiversidad y el medio ambiente, conoce e implementa el productor en su sistema productivo.',4,5,1,0,'{"id":48,"component_id":4,"question_type_id":5,"description":"Prácticas de manejo y conservación del medio ambiente y de la biodiversidad Este componente busca identificar qué prácticas de conservación de la biodiversidad y el medio ambiente, conoce e implementa el productor en su sistema productivo.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":174,"question_id":48,"name":"No conoce, ni implementa","value":"1","other_question_id":null},{"id":175,"question_id":48,"name":"Conoce, pero no implementa","value":"2","other_question_id":null},{"id":176,"question_id":48,"name":"Implementa sin planificación","value":"3","other_question_id":null},{"id":177,"question_id":48,"name":"Implementa con planificación","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(49,'Prácticas ambientales sostenibles y/o sustentables. Este componente busca identificar qué actividades de conservación del recurso hídrico y manejo del suelo, que conoce e implementa el productor en su sistema productivo',4,5,1,0,'{"id":49,"component_id":4,"question_type_id":5,"description":"Prácticas ambientales sostenibles y/o sustentables. Este componente busca identificar qué actividades de conservación del recurso hídrico y manejo del suelo, que conoce e implementa el productor en su sistema productivo","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":178,"question_id":49,"name":"No conoce ni implementa","value":"1","other_question_id":null},{"id":179,"question_id":49,"name":"Conoce, pero no implementa","value":"2","other_question_id":null},{"id":180,"question_id":49,"name":"Implementa parcialmente","value":"3","other_question_id":null},{"id":181,"question_id":49,"name":"Implementación planificada","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(50,'Actividades de mitigación y adaptación al cambio climático. Este componente busca establecer qué grado de conocimientos e implementación posee el productor sobre medidas de prevención y/o recuperación del medio ambiente, enfocadas en la mitigación, adaptación al cambio climático y disminución del calentamiento global. Y si planifica la producción de acuerdo a la información climática histórica y pronósticos.',4,5,1,0,'{"id":50,"component_id":4,"question_type_id":5,"description":"Actividades de mitigación y adaptación al cambio climático. Este componente busca establecer qué grado de conocimientos e implementación posee el productor sobre medidas de prevención y/o recuperación del medio ambiente, enfocadas en la mitigación, adaptación al cambio climático y disminución del calentamiento global. Y si planifica la producción de acuerdo a la información climática histórica y pronósticos.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":182,"question_id":50,"name":"No conoce","value":"1","other_question_id":null},{"id":183,"question_id":50,"name":"Conoce, pero no implementa","value":"2","other_question_id":null},{"id":184,"question_id":50,"name":"Conoce e implementa","value":"3","other_question_id":null},{"id":185,"question_id":50,"name":"Implementa y planifica","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(51,'Cumplimiento de normatividad ambiental. Este componente busca establecer que grado de conocimiento y cumplimiento tiene el productor frente a la normatividad ambiental relacionada con el desarrollo de sus actividades productivas y el entorno del territorio.',4,5,1,0,'{"id":51,"component_id":4,"question_type_id":5,"description":"Cumplimiento de normatividad ambiental. Este componente busca establecer que grado de conocimiento y cumplimiento tiene el productor frente a la normatividad ambiental relacionada con el desarrollo de sus actividades productivas y el entorno del territorio.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":186,"question_id":51,"name":"No conoce","value":"1","other_question_id":null},{"id":187,"question_id":51,"name":"Conoce, pero no implementa","value":"2","other_question_id":null},{"id":188,"question_id":51,"name":"Conoce e implementa parcialmente","value":"3","other_question_id":null},{"id":189,"question_id":51,"name":"Cumple y se certifica","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(52,'Conocimiento sobre instancias y mecanismos de participación. Este componente busca establecer el grado de conocimiento y de participación del productor, sobre las instancias y mecanismos disponibles en la normatividad colombiana.',4,5,1,0,'{"id":52,"component_id":4,"question_type_id":5,"description":"Conocimiento sobre instancias y mecanismos de participación. Este componente busca establecer el grado de conocimiento y de participación del productor, sobre las instancias y mecanismos disponibles en la normatividad colombiana.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":190,"question_id":52,"name":"Sin conocimiento","value":"1","other_question_id":null},{"id":191,"question_id":52,"name":"Conoce parcialmente","value":"2","other_question_id":null},{"id":192,"question_id":52,"name":"Conoce y participa ocasionalmente","value":"3","other_question_id":null},{"id":193,"question_id":52,"name":"Conoce y participa activamente","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(53,'Conocimiento sobre herramientas para la participación. Este componente busca definir el grado de conocimiento y participación del productor, en las herramientas de participación disponibles.',4,5,1,0,'{"id":53,"component_id":4,"question_type_id":5,"description":"Conocimiento sobre herramientas para la participación. Este componente busca definir el grado de conocimiento y participación del productor, en las herramientas de participación disponibles.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":194,"question_id":53,"name":"No conoce","value":"1","other_question_id":null},{"id":195,"question_id":53,"name":"Conoce parcialmente","value":"2","other_question_id":null},{"id":196,"question_id":53,"name":"Conoce y usa ocasionalmente","value":"3","other_question_id":null},{"id":197,"question_id":53,"name":"Conoce y lidera","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(54,'Ejercicio de control político y social. Este componente busca definir el grado de conocimiento y participación del productor, en los mecanismos de control político y social disponibles.',4,5,1,0,'{"id":54,"component_id":4,"question_type_id":5,"description":"Ejercicio de control político y social. Este componente busca definir el grado de conocimiento y participación del productor, en los mecanismos de control político y social disponibles.","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":198,"question_id":54,"name":"No conoce","value":"1","other_question_id":null},{"id":199,"question_id":54,"name":"Conoce parcialmente","value":"2","other_question_id":null},{"id":200,"question_id":54,"name":"Conoce y participa ocasionalmente","value":"3","other_question_id":null},{"id":201,"question_id":54,"name":"Conoce y lidera","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(55,'Fomento de la Autogestión de las comunidades. Este componente busca identificar el rol desempeñado por el productor, en el fomento y la autogestión de las comunidades en la búsqueda de objetivos comunes. ',4,5,1,0,'{"id":55,"component_id":4,"question_type_id":5,"description":"Fomento de la Autogestión de las comunidades. Este componente busca identificar el rol desempeñado por el productor, en el fomento y la autogestión de las comunidades en la búsqueda de objetivos comunes. ","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":70,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CLASIFICACIÓN","field_innova_name":"nothing","options":[{"id":202,"question_id":55,"name":"No gestiona","value":"1","other_question_id":null},{"id":203,"question_id":55,"name":"Gestión Individual","value":"2","other_question_id":null},{"id":204,"question_id":55,"name":"Gestión colectiva","value":"3","other_question_id":null},{"id":205,"question_id":55,"name":"Líder comunitario","value":"4","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(56,'¿Cuenta con Sisben?',5,6,1,0,'{"id":56,"component_id":5,"question_type_id":6,"description":"¿Cuenta con Sisben?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":11,"question_parent_id":null,"question_type_name":"LISTA DEPENDIENTE","component_name":"CARACTERIZACIÓN","field_innova_name":"sisben","options":[{"id":206,"question_id":56,"name":"SI","value":"1","other_question_id":13},{"id":207,"question_id":56,"name":"NO","value":"2","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(13,'¿En qué grupo del Sisben se encuentra ubicado?',5,5,1,0,'{"id":13,"component_id":5,"question_type_id":5,"description":"¿En qué grupo del Sisben se encuentra ubicado?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":12,"question_parent_id":null,"question_type_name":"LISTA","component_name":"CARACTERIZACIÓN","field_innova_name":"sisben_level","options":[{"id":49,"question_id":13,"name":"Grupo A = Pobreza extrema A1 a A5","value":"1","other_question_id":null},{"id":50,"question_id":13,"name":"Grupo B = Pobreza moderada B1 a B7","value":"2","other_question_id":null},{"id":51,"question_id":13,"name":"Grupo C = Vulnerable C1 a C18","value":"3","other_question_id":null}],"intervention_method_id":null,"intervention_method_name":null}'),(14,'¿Tiene usted la condición de víctima en los términos de la ley 1448 de 2011?',5,3,1,0,'{"id":14,"component_id":5,"question_type_id":3,"description":"¿Tiene usted la condición de víctima en los términos de la ley 1448 de 2011?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":13,"question_parent_id":null,"question_type_name":"LOGICA","component_name":"CARACTERIZACIÓN","field_innova_name":"victim_condition","options":null,"intervention_method_id":null,"intervention_method_name":null}'),(15,'¿Usted se considera mujer rural conforme a la Ley 731 de 2002?',5,3,1,0,'{"id":15,"component_id":5,"question_type_id":3,"description":"¿Usted se considera mujer rural conforme a la Ley 731 de 2002?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":14,"question_parent_id":null,"question_type_name":"LOGICA","component_name":"CARACTERIZACIÓN","field_innova_name":"rural_woman","options":null,"intervention_method_id":null,"intervention_method_name":null}'),(16,'¿Usted se reconoce como Agricultor/a Campesino,  Familiar, Étnica y Comunitario - ACEFC?',5,3,1,0,'{"id":16,"component_id":5,"question_type_id":3,"description":"¿Usted se reconoce como Agricultor/a Campesino,  Familiar, Étnica y Comunitario - ACEFC?","active":true,"multiple":false,"required":true,"levels":null,"maxlength":null,"field_innova_id":22,"question_parent_id":null,"question_type_name":"LOGICA","component_name":"CARACTERIZACIÓN","field_innova_name":"farmer_acfc","options":null,"intervention_method_id":null,"intervention_method_name":null}');`);
      await db.execAsync(`INSERT OR IGNORE INTO question_details (question_id,type_name,raw_json) VALUES (58,'lista','{"options":[{"id":208,"question_id":58,"name":"MASCULINO","value":"1","other_question_id":null},{"id":209,"question_id":58,"name":"FEMENINO","value":"2","other_question_id":null}]}'),(2,'lista dependiente','{"items":[{"id":6,"question_id":2,"name":"SI","value":"1","other_question_id":1},{"id":7,"question_id":2,"name":"NO","value":"2","other_question_id":null}]}'),(1,'lista','{"options":[{"id":1,"question_id":1,"name":"Discapacidad fIsica","value":"1","other_question_id":null},{"id":2,"question_id":1,"name":"Discapacidad sensorial","value":"2","other_question_id":null},{"id":3,"question_id":1,"name":"Discapacidad intelectual","value":"3","other_question_id":null},{"id":4,"question_id":1,"name":"Discapacidad PsIquica","value":"4","other_question_id":null},{"id":5,"question_id":1,"name":"Discapacidad multiple","value":"5","other_question_id":null}]}'),(59,'lista','{"options":[{"id":210,"question_id":59,"name":"Ninguno","value":"1","other_question_id":null},{"id":211,"question_id":59,"name":"Primaria","value":"2","other_question_id":null},{"id":212,"question_id":59,"name":"Secundaria","value":"3","other_question_id":null},{"id":213,"question_id":59,"name":"TEcnica","value":"4","other_question_id":null},{"id":214,"question_id":59,"name":"TecnolOgica","value":"5","other_question_id":null},{"id":215,"question_id":59,"name":"Universitario","value":"6","other_question_id":null},{"id":216,"question_id":59,"name":"Posgrado","value":"7","other_question_id":null}]}'),(6,'lista','{"options":[{"id":8,"question_id":6,"name":"IndIgena","value":"1","other_question_id":null},{"id":9,"question_id":6,"name":"Gitano(a) Rom","value":"2","other_question_id":null},{"id":10,"question_id":6,"name":"Mulato(a)","value":"3","other_question_id":null},{"id":11,"question_id":6,"name":"NARP - Negro(a), afrodescenciente, afrocolombiano(a), raizal, palenquero(a)","value":"4","other_question_id":null},{"id":12,"question_id":6,"name":"Ninguna de las anteriores","value":"5","other_question_id":null}]}'),(7,'lista','{"options":[{"id":13,"question_id":7,"name":"Vivienda Familiar","value":"1","other_question_id":null},{"id":14,"question_id":7,"name":"Colegios - Escuelas - Bibliotecas","value":"2","other_question_id":null},{"id":15,"question_id":7,"name":"Zonas Wifi","value":"3","other_question_id":null},{"id":16,"question_id":7,"name":"Establecimientos de servicios de internet","value":"4","other_question_id":null},{"id":17,"question_id":7,"name":"Servicio particular de internet","value":"5","other_question_id":null},{"id":18,"question_id":7,"name":"Red directa - Plan de datos - Celular","value":"6","other_question_id":null},{"id":19,"question_id":7,"name":"Vive digital","value":"7","other_question_id":null},{"id":20,"question_id":7,"name":"No accede","value":"8","other_question_id":null}]}'),(8,'lista dependiente','{"items":[{"id":21,"question_id":8,"name":"Cooperativas","value":"1","other_question_id":10},{"id":30,"question_id":8,"name":"Organizaciones comunitarias de ancianos o de jOvenes","value":"10","other_question_id":10},{"id":31,"question_id":8,"name":"No pertenece a ninguna asociaciOn","value":"11","other_question_id":null},{"id":32,"question_id":8,"name":"No sabe / No responde","value":"12","other_question_id":null},{"id":33,"question_id":8,"name":"Otra","value":"13","other_question_id":null},{"id":22,"question_id":8,"name":"Gremios","value":"2","other_question_id":10},{"id":23,"question_id":8,"name":"AsociaciOn de productores","value":"3","other_question_id":10},{"id":24,"question_id":8,"name":"Centros de investigaciOn","value":"4","other_question_id":10},{"id":25,"question_id":8,"name":"Consejo comunitario","value":"5","other_question_id":10},{"id":26,"question_id":8,"name":"JAC","value":"6","other_question_id":10},{"id":27,"question_id":8,"name":"JAL","value":"7","other_question_id":10},{"id":28,"question_id":8,"name":"AsociaciOn y organizaciOn Etnica","value":"8","other_question_id":10},{"id":29,"question_id":8,"name":"Organizaciones comunitarias de mujeres","value":"9","other_question_id":10}]}'),(10,'lista dependiente','{"items":[{"id":34,"question_id":10,"name":"SI","value":"1","other_question_id":9},{"id":35,"question_id":10,"name":"NO","value":"2","other_question_id":null}]}'),(11,'lista','{"options":[{"id":36,"question_id":11,"name":"LEC-A toda mAquina e infraestructura","value":"1","other_question_id":null},{"id":45,"question_id":11,"name":"LEC-Sostenibilidad agropecuaria y NegociosVerdes","value":"10","other_question_id":null},{"id":46,"question_id":11,"name":"PoblaciOn en situaciOn especial(VIctimas, reinsertados)","value":"11","other_question_id":null},{"id":47,"question_id":11,"name":"Ninguno","value":"12","other_question_id":null},{"id":48,"question_id":11,"name":"Otra","value":"13","other_question_id":null},{"id":37,"question_id":11,"name":"LEC-Compra de tierras de uso agropecuario","value":"2","other_question_id":null},{"id":38,"question_id":11,"name":"LEC-InclusiOn financiera","value":"3","other_question_id":null},{"id":39,"question_id":11,"name":"LEC-Comunidades Negras, Afrodescendientes, raizalez y palenqueras","value":"4","other_question_id":null},{"id":40,"question_id":11,"name":"LEC-Mujer rural y joven rural","value":"5","other_question_id":null},{"id":41,"question_id":11,"name":"LEC-SustituciOn","value":"6","other_question_id":null},{"id":42,"question_id":11,"name":"LEC-Sectores estratEgicos","value":"7","other_question_id":null},{"id":43,"question_id":11,"name":"LEC-ReactivaciOn productiva-Afectaciones climAticas","value":"8","other_question_id":null},{"id":44,"question_id":11,"name":"LEC-Agricultura por contrato","value":"9","other_question_id":null}]}'),(20,'lista','{"options":[{"id":52,"question_id":20,"name":"Propio sin tItulo","value":"1","other_question_id":null},{"id":53,"question_id":20,"name":"Propio con tItulo","value":"2","other_question_id":null},{"id":54,"question_id":20,"name":"En Arriendo o subarriendo","value":"3","other_question_id":null},{"id":55,"question_id":20,"name":"AparcerIa","value":"4","other_question_id":null},{"id":56,"question_id":20,"name":"En usufructo","value":"5","other_question_id":null},{"id":57,"question_id":20,"name":"En sucesiOn con tItulo","value":"6","other_question_id":null},{"id":58,"question_id":20,"name":"En sucesiOn sin tItulo","value":"7","other_question_id":null},{"id":59,"question_id":20,"name":"Propiedad colectiva","value":"8","other_question_id":null}]}'),(22,'lista','{"options":[{"id":60,"question_id":22,"name":"Interconexión Eléctrica","value":"1","other_question_id":null},{"id":69,"question_id":22,"name":"Internet","value":"10","other_question_id":null},{"id":61,"question_id":22,"name":"Energía Fotovoltaica o eólica","value":"2","other_question_id":null},{"id":62,"question_id":22,"name":"Gas domiciliario","value":"3","other_question_id":null},{"id":63,"question_id":22,"name":"Biogas","value":"4","other_question_id":null},{"id":64,"question_id":22,"name":"Unidad Sanitaria","value":"5","other_question_id":null},{"id":65,"question_id":22,"name":"Pozo sético","value":"6","other_question_id":null},{"id":66,"question_id":22,"name":"Señal de telefonía movil","value":"7","other_question_id":null},{"id":67,"question_id":22,"name":"Acueducto","value":"8","other_question_id":null},{"id":68,"question_id":22,"name":"Sistema de Riego","value":"9","other_question_id":null}]}'),(23,'lista','{"options":[{"id":70,"question_id":23,"name":"Via sin pavimentar","value":"1","other_question_id":null},{"id":71,"question_id":23,"name":"Sendero","value":"2","other_question_id":null},{"id":72,"question_id":23,"name":"Carretera","value":"3","other_question_id":null},{"id":73,"question_id":23,"name":"Fluivial","value":"4","other_question_id":null},{"id":74,"question_id":23,"name":"Otro","value":"5","other_question_id":null}]}'),(24,'lista','{"options":[{"id":75,"question_id":24,"name":"AutomOvil","value":"1","other_question_id":null},{"id":76,"question_id":24,"name":"Moto","value":"2","other_question_id":null},{"id":77,"question_id":24,"name":"Bicicleta","value":"3","other_question_id":null},{"id":78,"question_id":24,"name":"Transporte animal","value":"4","other_question_id":null},{"id":79,"question_id":24,"name":"Transporte pUblico","value":"5","other_question_id":null},{"id":80,"question_id":24,"name":"Transporte aEreo","value":"6","other_question_id":null},{"id":81,"question_id":24,"name":"Transporte fluvial","value":"7","other_question_id":null},{"id":82,"question_id":24,"name":"Ninguno","value":"8","other_question_id":null}]}'),(25,'lista','{"options":[{"id":83,"question_id":25,"name":"Hasta 30 minutos","value":"1","other_question_id":null},{"id":84,"question_id":25,"name":"Entre 31 minutos y 1 hora y 30 minutos","value":"2","other_question_id":null},{"id":85,"question_id":25,"name":"MAs de 1 1/2 horas","value":"3","other_question_id":null}]}'),(62,'lista','{"options":[{"id":217,"question_id":62,"name":"Kilos","value":"1","other_question_id":null},{"id":218,"question_id":62,"name":"Toneladas","value":"2","other_question_id":null},{"id":219,"question_id":62,"name":"Litros","value":"3","other_question_id":null},{"id":220,"question_id":62,"name":"Cargas","value":"4","other_question_id":null},{"id":221,"question_id":62,"name":"Arrobas","value":"5","other_question_id":null},{"id":222,"question_id":62,"name":"Bultos","value":"6","other_question_id":null},{"id":223,"question_id":62,"name":"Atados","value":"7","other_question_id":null},{"id":224,"question_id":62,"name":"Galones","value":"8","other_question_id":null},{"id":225,"question_id":62,"name":"Cubetas","value":"9","other_question_id":null}]}'),(63,'lista','{"options":[{"id":226,"question_id":63,"name":"Plazas de mercado","value":"1","other_question_id":null},{"id":235,"question_id":63,"name":"Exportadores","value":"10","other_question_id":null},{"id":236,"question_id":63,"name":"Mayoristas","value":"11","other_question_id":null},{"id":237,"question_id":63,"name":"Almacenes de cadena grandes superficies","value":"12","other_question_id":null},{"id":238,"question_id":63,"name":"Ninguna","value":"13","other_question_id":null},{"id":239,"question_id":63,"name":"Otro","value":"14","other_question_id":null},{"id":227,"question_id":63,"name":"Intermediarios","value":"2","other_question_id":null},{"id":228,"question_id":63,"name":"Empresas","value":"3","other_question_id":null},{"id":229,"question_id":63,"name":"Mercados Campesinos","value":"4","other_question_id":null},{"id":230,"question_id":63,"name":"Compras públicas","value":"5","other_question_id":null},{"id":231,"question_id":63,"name":"Tiendas","value":"6","other_question_id":null},{"id":232,"question_id":63,"name":"Consumidor directo","value":"7","other_question_id":null},{"id":233,"question_id":63,"name":"Cooperativas","value":"8","other_question_id":null},{"id":234,"question_id":63,"name":"Gremios","value":"9","other_question_id":null}]}'),(26,'lista','{"options":[{"id":86,"question_id":26,"name":"Sis. productivo integrado, subsistencia - ACFEC","value":"1","other_question_id":null},{"id":87,"question_id":26,"name":"Tradicional","value":"2","other_question_id":null},{"id":88,"question_id":26,"name":"No Tradicional especializado","value":"3","other_question_id":null},{"id":89,"question_id":26,"name":"Agronegocio","value":"4","other_question_id":null}]}'),(27,'lista','{"options":[{"id":90,"question_id":27,"name":"No tiene","value":"1","other_question_id":null},{"id":91,"question_id":27,"name":"Ocasional","value":"2","other_question_id":null},{"id":92,"question_id":27,"name":"Frecuente","value":"3","other_question_id":null},{"id":93,"question_id":27,"name":"Permanente e integrada","value":"4","other_question_id":null}]}'),(28,'lista','{"options":[{"id":94,"question_id":28,"name":"Acceso restringido","value":"1","other_question_id":null},{"id":95,"question_id":28,"name":"Acceso Limitado","value":"2","other_question_id":null},{"id":96,"question_id":28,"name":"Acceso común","value":"3","other_question_id":null},{"id":97,"question_id":28,"name":"Acceso especializado","value":"4","other_question_id":null}]}'),(29,'lista','{"options":[{"id":98,"question_id":29,"name":"Desconoce","value":"1","other_question_id":null},{"id":99,"question_id":29,"name":"Conoce parcialmente","value":"2","other_question_id":null},{"id":100,"question_id":29,"name":"Conoce y aplica","value":"3","other_question_id":null},{"id":101,"question_id":29,"name":"Productor certificado","value":"4","other_question_id":null}]}'),(30,'lista','{"options":[{"id":102,"question_id":30,"name":"Autoconsumo y/o no planificada","value":"1","other_question_id":null},{"id":103,"question_id":30,"name":"Tradicional","value":"2","other_question_id":null},{"id":104,"question_id":30,"name":"Planificado tradicional","value":"3","other_question_id":null},{"id":105,"question_id":30,"name":"Planificada especializada","value":"4","other_question_id":null}]}'),(31,'lista','{"options":[{"id":106,"question_id":31,"name":"Local","value":"1","other_question_id":null},{"id":107,"question_id":31,"name":"Básico","value":"2","other_question_id":null},{"id":108,"question_id":31,"name":"Tradicional","value":"3","other_question_id":null},{"id":109,"question_id":31,"name":"Especializado","value":"4","other_question_id":null}]}'),(32,'lista','{"options":[{"id":110,"question_id":32,"name":"Ninguno","value":"1","other_question_id":null},{"id":111,"question_id":32,"name":"Básico por demanda","value":"2","other_question_id":null},{"id":112,"question_id":32,"name":"Avanzado","value":"3","other_question_id":null},{"id":113,"question_id":32,"name":"Especializado","value":"4","other_question_id":null}]}'),(33,'lista','{"options":[{"id":114,"question_id":33,"name":"No lleva registros","value":"1","other_question_id":null},{"id":115,"question_id":33,"name":"Básico","value":"2","other_question_id":null},{"id":116,"question_id":33,"name":"Manual","value":"3","other_question_id":null},{"id":117,"question_id":33,"name":"Sistematizado","value":"4","other_question_id":null}]}'),(34,'lista','{"options":[{"id":118,"question_id":34,"name":"Por cuenta propia","value":"1","other_question_id":null},{"id":119,"question_id":34,"name":"Informal","value":"2","other_question_id":null},{"id":120,"question_id":34,"name":"Formal sin estructura administrativa","value":"3","other_question_id":null},{"id":121,"question_id":34,"name":"Formal con estructura administrativa","value":"4","other_question_id":null}]}'),(35,'lista','{"options":[{"id":122,"question_id":35,"name":"Excluido/informal","value":"1","other_question_id":null},{"id":123,"question_id":35,"name":"Formal no bancarizado","value":"2","other_question_id":null},{"id":124,"question_id":35,"name":"Formalizado bancarizado","value":"3","other_question_id":null},{"id":125,"question_id":35,"name":"Formal enfocado al crecimiento del negocio","value":"4","other_question_id":null}]}'),(36,'lista','{"options":[{"id":126,"question_id":36,"name":"No interesado","value":"1","other_question_id":null},{"id":127,"question_id":36,"name":"Vinculado","value":"2","other_question_id":null},{"id":128,"question_id":36,"name":"Sin participación","value":"3","other_question_id":null},{"id":129,"question_id":36,"name":"Si, activo","value":"4","other_question_id":null}]}'),(37,'lista','{"options":[{"id":130,"question_id":37,"name":"Sin participación","value":"1","other_question_id":null},{"id":131,"question_id":37,"name":"Eventual","value":"2","other_question_id":null},{"id":132,"question_id":37,"name":"Frecuente","value":"3","other_question_id":null},{"id":133,"question_id":37,"name":"Activo","value":"4","other_question_id":null}]}'),(38,'lista','{"options":[{"id":134,"question_id":38,"name":"Sin participación","value":"1","other_question_id":null},{"id":135,"question_id":38,"name":"Individual","value":"2","other_question_id":null},{"id":136,"question_id":38,"name":"Colectiva sin organización","value":"3","other_question_id":null},{"id":137,"question_id":38,"name":"Colectivo/organizado","value":"4","other_question_id":null}]}'),(39,'lista','{"options":[{"id":138,"question_id":39,"name":"No participa","value":"1","other_question_id":null},{"id":139,"question_id":39,"name":"No formal","value":"2","other_question_id":null},{"id":140,"question_id":39,"name":"Formal esporádica","value":"3","other_question_id":null},{"id":141,"question_id":39,"name":"Formal y continua","value":"4","other_question_id":null}]}'),(40,'lista','{"options":[{"id":142,"question_id":40,"name":"Sin acceso","value":"1","other_question_id":null},{"id":143,"question_id":40,"name":"Con acceso de baja pertinencia y cobertura","value":"2","other_question_id":null},{"id":144,"question_id":40,"name":"Colectiva","value":"3","other_question_id":null},{"id":145,"question_id":40,"name":"Permanente y especializada","value":"4","other_question_id":null}]}'),(41,'lista','{"options":[{"id":146,"question_id":41,"name":"No conoce","value":"1","other_question_id":null},{"id":147,"question_id":41,"name":"Sin Interés","value":"2","other_question_id":null},{"id":148,"question_id":41,"name":"En proceso","value":"3","other_question_id":null},{"id":149,"question_id":41,"name":"Certificado","value":"4","other_question_id":null}]}'),(42,'lista','{"options":[{"id":150,"question_id":42,"name":"No conoce","value":"1","other_question_id":null},{"id":151,"question_id":42,"name":"Con nociones","value":"2","other_question_id":null},{"id":152,"question_id":42,"name":"Reconoce","value":"3","other_question_id":null},{"id":153,"question_id":42,"name":"Aplica","value":"4","other_question_id":null}]}'),(43,'lista','{"options":[{"id":154,"question_id":43,"name":"Pocas","value":"1","other_question_id":null},{"id":155,"question_id":43,"name":"Algunas","value":"2","other_question_id":null},{"id":156,"question_id":43,"name":"Mayoría de fuentes","value":"3","other_question_id":null},{"id":157,"question_id":43,"name":"Todas las fuentes","value":"4","other_question_id":null}]}'),(44,'lista','{"options":[{"id":158,"question_id":44,"name":"Ninguno","value":"1","other_question_id":null},{"id":159,"question_id":44,"name":"Regular","value":"2","other_question_id":null},{"id":160,"question_id":44,"name":"Frecuente","value":"3","other_question_id":null},{"id":161,"question_id":44,"name":"Permanente","value":"4","other_question_id":null}]}'),(45,'lista','{"options":[{"id":162,"question_id":45,"name":"Sin acceso","value":"1","other_question_id":null},{"id":163,"question_id":45,"name":"Ninguna","value":"2","other_question_id":null},{"id":164,"question_id":45,"name":"Regular","value":"3","other_question_id":null},{"id":165,"question_id":45,"name":"Frecuente","value":"4","other_question_id":null}]}'),(46,'lista','{"options":[{"id":166,"question_id":46,"name":"Ninguna","value":"1","other_question_id":null},{"id":167,"question_id":46,"name":"Básica","value":"2","other_question_id":null},{"id":168,"question_id":46,"name":"Intermedia","value":"3","other_question_id":null},{"id":169,"question_id":46,"name":"Avanzado","value":"4","other_question_id":null}]}'),(47,'lista','{"options":[{"id":170,"question_id":47,"name":"Bajo","value":"1","other_question_id":null},{"id":171,"question_id":47,"name":"Intermedio","value":"2","other_question_id":null},{"id":172,"question_id":47,"name":"Alto","value":"3","other_question_id":null},{"id":173,"question_id":47,"name":"Avanzado","value":"4","other_question_id":null}]}'),(48,'lista','{"options":[{"id":174,"question_id":48,"name":"No conoce, ni implementa","value":"1","other_question_id":null},{"id":175,"question_id":48,"name":"Conoce, pero no implementa","value":"2","other_question_id":null},{"id":176,"question_id":48,"name":"Implementa sin planificación","value":"3","other_question_id":null},{"id":177,"question_id":48,"name":"Implementa con planificación","value":"4","other_question_id":null}]}'),(49,'lista','{"options":[{"id":178,"question_id":49,"name":"No conoce ni implementa","value":"1","other_question_id":null},{"id":179,"question_id":49,"name":"Conoce, pero no implementa","value":"2","other_question_id":null},{"id":180,"question_id":49,"name":"Implementa parcialmente","value":"3","other_question_id":null},{"id":181,"question_id":49,"name":"Implementación planificada","value":"4","other_question_id":null}]}'),(50,'lista','{"options":[{"id":182,"question_id":50,"name":"No conoce","value":"1","other_question_id":null},{"id":183,"question_id":50,"name":"Conoce, pero no implementa","value":"2","other_question_id":null},{"id":184,"question_id":50,"name":"Conoce e implementa","value":"3","other_question_id":null},{"id":185,"question_id":50,"name":"Implementa y planifica","value":"4","other_question_id":null}]}'),(51,'lista','{"options":[{"id":186,"question_id":51,"name":"No conoce","value":"1","other_question_id":null},{"id":187,"question_id":51,"name":"Conoce, pero no implementa","value":"2","other_question_id":null},{"id":188,"question_id":51,"name":"Conoce e implementa parcialmente","value":"3","other_question_id":null},{"id":189,"question_id":51,"name":"Cumple y se certifica","value":"4","other_question_id":null}]}'),(52,'lista','{"options":[{"id":190,"question_id":52,"name":"Sin conocimiento","value":"1","other_question_id":null},{"id":191,"question_id":52,"name":"Conoce parcialmente","value":"2","other_question_id":null},{"id":192,"question_id":52,"name":"Conoce y participa ocasionalmente","value":"3","other_question_id":null},{"id":193,"question_id":52,"name":"Conoce y participa activamente","value":"4","other_question_id":null}]}'),(53,'lista','{"options":[{"id":194,"question_id":53,"name":"No conoce","value":"1","other_question_id":null},{"id":195,"question_id":53,"name":"Conoce parcialmente","value":"2","other_question_id":null},{"id":196,"question_id":53,"name":"Conoce y usa ocasionalmente","value":"3","other_question_id":null},{"id":197,"question_id":53,"name":"Conoce y lidera","value":"4","other_question_id":null}]}'),(54,'lista','{"options":[{"id":198,"question_id":54,"name":"No conoce","value":"1","other_question_id":null},{"id":199,"question_id":54,"name":"Conoce parcialmente","value":"2","other_question_id":null},{"id":200,"question_id":54,"name":"Conoce y participa ocasionalmente","value":"3","other_question_id":null},{"id":201,"question_id":54,"name":"Conoce y lidera","value":"4","other_question_id":null}]}'),(55,'lista','{"options":[{"id":202,"question_id":55,"name":"No gestiona","value":"1","other_question_id":null},{"id":203,"question_id":55,"name":"Gestión Individual","value":"2","other_question_id":null},{"id":204,"question_id":55,"name":"Gestión colectiva","value":"3","other_question_id":null},{"id":205,"question_id":55,"name":"Líder comunitario","value":"4","other_question_id":null}]}'),(56,'lista dependiente','{"items":[{"id":206,"question_id":56,"name":"SI","value":"1","other_question_id":13},{"id":207,"question_id":56,"name":"NO","value":"2","other_question_id":null}]}'),(13,'lista','{"options":[{"id":49,"question_id":13,"name":"Grupo A = Pobreza extrema A1 a A5","value":"1","other_question_id":null},{"id":50,"question_id":13,"name":"Grupo B = Pobreza moderada B1 a B7","value":"2","other_question_id":null},{"id":51,"question_id":13,"name":"Grupo C = Vulnerable C1 a C18","value":"3","other_question_id":null}]}');`);
      await db.execAsync(`INSERT OR IGNORE INTO innova_fields (id,name,field_type,raw_json) VALUES (2,'disability',NULL,'{"name":"disability","id":2,"component_id":1}'),(3,'which_disability',NULL,'{"name":"which_disability","id":3,"component_id":1}'),(1,'data_authorization',NULL,'{"name":"data_authorization","id":1,"component_id":1}'),(4,'educational_level',NULL,'{"name":"educational_level","id":4,"component_id":1}'),(5,'reinstatement',NULL,'{"name":"reinstatement","id":5,"component_id":1}'),(6,'head_family',NULL,'{"name":"head_family","id":6,"component_id":1}'),(7,'people_live_property_user',NULL,'{"name":"people_live_property_user","id":7,"component_id":1}'),(8,'telephone_messaging',NULL,'{"name":"telephone_messaging","id":8,"component_id":1}'),(9,'social_networks',NULL,'{"name":"social_networks","id":9,"component_id":1}'),(10,'social_networks_other',NULL,'{"name":"social_networks_other","id":10,"component_id":1}'),(11,'sisben',NULL,'{"name":"sisben","id":11,"component_id":1}'),(12,'sisben_level',NULL,'{"name":"sisben_level","id":12,"component_id":1}'),(13,'victim_condition',NULL,'{"name":"victim_condition","id":13,"component_id":1}'),(14,'rural_woman',NULL,'{"name":"rural_woman","id":14,"component_id":1}'),(15,'beneficiary_program_agriculture',NULL,'{"name":"beneficiary_program_agriculture","id":15,"component_id":1}'),(16,'ethnicity',NULL,'{"name":"ethnicity","id":16,"component_id":1}'),(17,'indig_reservation',NULL,'{"name":"indig_reservation","id":17,"component_id":1}'),(18,'population_territorial_development',NULL,'{"name":"population_territorial_development","id":18,"component_id":1}'),(19,'beneficiary_substitution_illicit_crops',NULL,'{"name":"beneficiary_substitution_illicit_crops","id":19,"component_id":1}'),(20,'access_internet',NULL,'{"name":"access_internet","id":20,"component_id":1}'),(21,'registered_intensive_aquaculture',NULL,'{"name":"registered_intensive_aquaculture","id":21,"component_id":1}'),(22,'farmer_acfc',NULL,'{"name":"farmer_acfc","id":22,"component_id":1}'),(23,'belong_collective_figure',NULL,'{"name":"belong_collective_figure","id":23,"component_id":1}'),(24,'other_collective_figure',NULL,'{"name":"other_collective_figure","id":24,"component_id":1}'),(25,'legal_collective_figure',NULL,'{"name":"legal_collective_figure","id":25,"component_id":1}'),(26,'name_collective_figure',NULL,'{"name":"name_collective_figure","id":26,"component_id":1}'),(27,'citizen_participation',NULL,'{"name":"citizen_participation","id":27,"component_id":1}'),(28,'perform_citizen_participation',NULL,'{"name":"perform_citizen_participation","id":28,"component_id":1}'),(29,'social_participation',NULL,'{"name":"social_participation","id":29,"component_id":1}'),(30,'community_benefit_plans',NULL,'{"name":"community_benefit_plans","id":30,"component_id":1}'),(31,'production_credit_user',NULL,'{"name":"production_credit_user","id":31,"component_id":1}'),(32,'access_economic_resources',NULL,'{"name":"access_economic_resources","id":32,"component_id":1}'),(33,'agricultural_credit_user',NULL,'{"name":"agricultural_credit_user","id":33,"component_id":1}'),(34,'agricultural_credit_which',NULL,'{"name":"agricultural_credit_which","id":34,"component_id":1}'),(35,'institutional_offer',NULL,'{"name":"institutional_offer","id":35,"component_id":1}'),(36,'name_property',NULL,'{"name":"name_property","id":36,"component_id":2}'),(37,'department_id',NULL,'{"name":"department_id","id":37,"component_id":2}'),(38,'municipality_id',NULL,'{"name":"municipality_id","id":38,"component_id":2}'),(39,'municipality_pdet',NULL,'{"name":"municipality_pdet","id":39,"component_id":2}'),(40,'sidewalk',NULL,'{"name":"sidewalk","id":40,"component_id":2}'),(41,'sidewalk_other',NULL,'{"name":"sidewalk_other","id":41,"component_id":2}'),(42,'tenure_property',NULL,'{"name":"tenure_property","id":42,"component_id":2}'),(43,'property_registered_ica',NULL,'{"name":"property_registered_ica","id":43,"component_id":2}'),(44,'total_property_area',NULL,'{"name":"total_property_area","id":44,"component_id":2}'),(45,'property_unit_measure',NULL,'{"name":"property_unit_measure","id":45,"component_id":2}'),(46,'latitude_property',NULL,'{"name":"latitude_property","id":46,"component_id":2}'),(47,'longitude_property',NULL,'{"name":"longitude_property","id":47,"component_id":2}'),(48,'domestic_services',NULL,'{"name":"domestic_services","id":48,"component_id":2}'),(49,'road_access',NULL,'{"name":"road_access","id":49,"component_id":2}'),(50,'road_status',NULL,'{"name":"road_status","id":50,"component_id":2}'),(51,'conveyance',NULL,'{"name":"conveyance","id":51,"component_id":2}'),(52,'municipal_arrival_time',NULL,'{"name":"municipal_arrival_time","id":52,"component_id":2}'),(53,'water_origin',NULL,'{"name":"water_origin","id":53,"component_id":2}'),(54,'water_availability',NULL,'{"name":"water_availability","id":54,"component_id":2}'),(55,'water_drinking',NULL,'{"name":"water_drinking","id":55,"component_id":2}'),(56,'production_lines',NULL,'{"name":"production_lines","id":56,"component_id":3}'),(57,'production_lines_which',NULL,'{"name":"production_lines_which","id":57,"component_id":4}'),(58,'used_productive_area',NULL,'{"name":"used_productive_area","id":58,"component_id":4}'),(59,'have_environmental_licenses',NULL,'{"name":"have_environmental_licenses","id":59,"component_id":4}'),(60,'sell_most_products',NULL,'{"name":"sell_most_products","id":60,"component_id":4}'),(61,'sell_most_products_other',NULL,'{"name":"sell_most_products_other","id":61,"component_id":4}'),(62,'workforce_production',NULL,'{"name":"workforce_production","id":62,"component_id":4}'),(63,'assistance_last',NULL,'{"name":"assistance_last","id":63,"component_id":4}'),(64,'assistance_issue',NULL,'{"name":"assistance_issue","id":64,"component_id":4}'),(65,'assistance_frequency',NULL,'{"name":"assistance_frequency","id":65,"component_id":4}'),(66,'assistance_who',NULL,'{"name":"assistance_who","id":66,"component_id":4}'),(67,'agricultural_assistance_user',NULL,'{"name":"agricultural_assistance_user","id":67,"component_id":4}'),(68,'assistance_how',NULL,'{"name":"assistance_how","id":68,"component_id":4}'),(69,'assistance_how_other',NULL,'{"name":"assistance_how_other","id":69,"component_id":4}'),(70,'nothing',NULL,'{"name":"nothing","id":70,"component_id":4}'),(71,'date_birth',NULL,'{"name":"date_birth","id":71,"component_id":1}'),(72,'phone',NULL,'{"name":"phone","id":72,"component_id":1}'),(73,'email',NULL,'{"name":"email","id":73,"component_id":1}'),(74,'sex_at_birth',NULL,'{"name":"sex_at_birth","id":74,"component_id":1}');`);
    },
  },
  {
    version: 12,
    up: async (db) => {
      const srCols = await db.getAllAsync<{name:string}>('PRAGMA table_info(survey_results);');
      if (!srCols.some(c => c.name === 'question_order')) {
        await db.execAsync('ALTER TABLE survey_results ADD COLUMN question_order INTEGER NOT NULL DEFAULT 0;');
      }
    },
  },
  {
    version: 13,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS visit2_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          visit_uuid TEXT NOT NULL UNIQUE,
          payload TEXT NOT NULL,
          photos TEXT NOT NULL DEFAULT '[]',
          user_id INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_visit2_queue_status ON visit2_queue(status);
        CREATE INDEX IF NOT EXISTS idx_visit2_queue_user ON visit2_queue(user_id);
      `);
    },
  },
  {
    version: 14,
    up: async (db) => {
      const COMPONENT_ID = 5;

      const q13Payload = {
        id: 13,
        component_id: COMPONENT_ID,
        question_type_id: 5,
        description:
          "¿En qué grupo del Sisben se encuentra ubicado?",
        active: true,
        multiple: false,
        required: true,
        levels: null,
        maxlength: null,
        field_innova_id: 12,
        question_parent_id: null,
        question_type_name: "LISTA",
        component_name: "CARACTERIZACIÓN",
        field_innova_name: "sisben_level",
        options: [
          {
            id: 49,
            question_id: 13,
            name: "Grupo A = Pobreza extrema A1 a A5",
            value: "1",
            other_question_id: null,
          },
          {
            id: 50,
            question_id: 13,
            name: "Grupo B = Pobreza moderada B1 a B7",
            value: "2",
            other_question_id: null,
          },
          {
            id: 51,
            question_id: 13,
            name: "Grupo C = Vulnerable C1 a C18",
            value: "3",
            other_question_id: null,
          },
        ],
        intervention_method_id: null,
        intervention_method_name: null,
        order: 2,
        name: "¿En qué grupo del Sisben se encuentra ubicado?",
        is_required: true,
      };

      const q56Payload = {
        id: 56,
        component_id: COMPONENT_ID,
        question_type_id: 6,
        description: "¿Cuenta con Sisben?",
        active: true,
        multiple: false,
        required: true,
        levels: null,
        maxlength: null,
        field_innova_id: 11,
        question_parent_id: null,
        question_type_name: "LISTA DEPENDIENTE",
        component_name: "CARACTERIZACIÓN",
        field_innova_name: "sisben",
        options: [
          {
            id: 206,
            question_id: 56,
            name: "SI",
            value: "1",
            other_question_id: 13,
          },
          {
            id: 207,
            question_id: 56,
            name: "NO",
            value: "2",
            other_question_id: null,
          },
        ],
        intervention_method_id: null,
        intervention_method_name: null,
        order: 1,
        name: "¿Cuenta con Sisben?",
        is_required: true,
      };

      await db.runAsync(
        `INSERT OR REPLACE INTO questions (id, name, component_id, question_type_id, is_required, sort_order, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          13,
          q13Payload.name ?? "",
          COMPONENT_ID,
          5,
          1,
          2,
          JSON.stringify(q13Payload),
        ],
      );

      await db.runAsync(
        `INSERT OR REPLACE INTO questions (id, name, component_id, question_type_id, is_required, sort_order, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          56,
          q56Payload.name ?? "",
          COMPONENT_ID,
          6,
          1,
          1,
          JSON.stringify(q56Payload),
        ],
      );

      await db.runAsync(
        `INSERT OR REPLACE INTO question_details (question_id, type_name, raw_json)
         VALUES (?, 'lista dependiente', ?)`,
        [
          56,
          JSON.stringify({
            items: [
              {
                id: 206,
                question_id: 56,
                name: "SI",
                value: "1",
                other_question_id: 13,
              },
              {
                id: 207,
                question_id: 56,
                name: "NO",
                value: "2",
                other_question_id: null,
              },
            ],
          }),
        ],
      );

      await db.runAsync(
        `INSERT OR REPLACE INTO question_details (question_id, type_name, raw_json)
         VALUES (?, 'lista', ?)`,
        [
          13,
          JSON.stringify({
            options: [
              {
                id: 49,
                question_id: 13,
                name: "Grupo A = Pobreza extrema A1 a A5",
                value: "1",
                other_question_id: null,
              },
              {
                id: 50,
                question_id: 13,
                name: "Grupo B = Pobreza moderada B1 a B7",
                value: "2",
                other_question_id: null,
              },
              {
                id: 51,
                question_id: 13,
                name: "Grupo C = Vulnerable C1 a C18",
                value: "3",
                other_question_id: null,
              },
            ],
          }),
        ],
      );

      await db.runAsync(
        `INSERT OR REPLACE INTO innova_fields (id, name, field_type, raw_json) VALUES (?, ?, ?, ?)`,
        [
          11,
          "sisben",
          null,
          JSON.stringify({
            name: "sisben",
            id: 11,
            component_id: COMPONENT_ID,
          }),
        ],
      );
      await db.runAsync(
        `INSERT OR REPLACE INTO innova_fields (id, name, field_type, raw_json) VALUES (?, ?, ?, ?)`,
        [
          12,
          "sisben_level",
          null,
          JSON.stringify({
            name: "sisben_level",
            id: 12,
            component_id: COMPONENT_ID,
          }),
        ],
      );
    },
  },
  {
    version: 15,
    up: async (db) => {
      const COMPONENT_ID = 5;
      /** Alineado con GET /surveys/.../intervention_method (campo `order`). */
      const ORDER_BY_ID: Record<number, number> = {
        56: 1,
        13: 2,
        14: 3,
        15: 4,
        16: 5,
      };

      for (const [idStr, ord] of Object.entries(ORDER_BY_ID)) {
        const id = Number(idStr);
        const row = await db.getFirstAsync<{ raw_json: string }>(
          `SELECT raw_json FROM questions WHERE id = ? AND component_id = ?`,
          id,
          COMPONENT_ID,
        );
        if (!row?.raw_json) continue;

        try {
          const parsed = JSON.parse(row.raw_json) as Record<string, unknown>;
          parsed.order = ord;
          await db.runAsync(
            `UPDATE questions SET sort_order = ?, raw_json = ? WHERE id = ? AND component_id = ?`,
            ord,
            JSON.stringify(parsed),
            id,
            COMPONENT_ID,
          );
        } catch {
          // ignorar JSON inválido
        }
      }
    },
  },
];

/**
 * Idempotent safety-net schema: ensures all critical tables exist even if a
 * migration previously failed or was partially applied. Every statement uses
 * CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS so it is safe to
 * run an unlimited number of times on the same database.
 */
async function ensureCoreSchema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    -- Auth
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      roles_json TEXT NOT NULL DEFAULT '[]',
      first_name TEXT,
      last_name TEXT
    );

    -- Projects
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type_id INTEGER,
      role_name TEXT,
      raw_json TEXT NOT NULL
    );

    -- Producers
    CREATE TABLE IF NOT EXISTS producers (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL,
      identification TEXT NOT NULL,
      first_name TEXT NOT NULL,
      middle_name TEXT,
      first_surname TEXT NOT NULL,
      last_surname TEXT,
      email TEXT,
      phone TEXT,
      raw_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_producers_project_id ON producers(project_id);

    -- Producer details
    CREATE TABLE IF NOT EXISTS producer_details (
      id INTEGER PRIMARY KEY,
      raw_json TEXT NOT NULL
    );

    -- Survey components
    CREATE TABLE IF NOT EXISTS components (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      raw_json TEXT NOT NULL
    );

    -- Question types
    CREATE TABLE IF NOT EXISTS question_types (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );

    -- Questions
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      component_id INTEGER NOT NULL,
      question_type_id INTEGER NOT NULL,
      is_required INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      raw_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_questions_component_id ON questions(component_id);

    -- Question details
    CREATE TABLE IF NOT EXISTS question_details (
      question_id INTEGER PRIMARY KEY,
      type_name TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    -- Innova fields
    CREATE TABLE IF NOT EXISTS innova_fields (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      field_type TEXT,
      raw_json TEXT NOT NULL
    );

    -- Sync metadata
    CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Sync queue
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);

    -- Survey results
    CREATE TABLE IF NOT EXISTS survey_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id INTEGER NOT NULL DEFAULT 0,
      answer_id INTEGER NOT NULL UNIQUE,
      question_id INTEGER NOT NULL,
      answer_value TEXT NOT NULL DEFAULT '',
      item_name TEXT,
      question_description TEXT,
      question_type_id INTEGER NOT NULL DEFAULT 0,
      question_parent_id INTEGER,
      question_order INTEGER NOT NULL DEFAULT 0,
      intervention_method_id INTEGER NOT NULL,
      producer_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_survey_results_lookup
      ON survey_results(producer_id, project_id, intervention_method_id);

    -- Static municipalities (pre-seeded, offline-ready)
    CREATE TABLE IF NOT EXISTS static_municipalities (
      department_cod TEXT NOT NULL,
      department TEXT NOT NULL,
      municipality_code TEXT NOT NULL,
      municipality TEXT NOT NULL,
      PRIMARY KEY (department_cod, municipality_code)
    );

    -- Producer intervention methods
    CREATE TABLE IF NOT EXISTS producer_intervention_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producer_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      intervention_method_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(producer_id, project_id, intervention_method_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pim_producer
      ON producer_intervention_methods(producer_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_pim_user
      ON producer_intervention_methods(user_id);
  `);
}

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  // Ensure _migrations table exists first
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const appliedRows = await db.getAllAsync<{ version: number }>(
    "SELECT version FROM _migrations ORDER BY version",
  );
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;

    console.log(`[DB] Running migration v${migration.version}...`);
    await db.execAsync("BEGIN TRANSACTION;");
    try {
      await migration.up(db);
      await db.runAsync(
        "INSERT INTO _migrations (version) VALUES (?)",
        migration.version,
      );
      await db.execAsync("COMMIT;");
      console.log(`[DB] Migration v${migration.version} applied successfully.`);
    } catch (error) {
      await db.execAsync("ROLLBACK;");
      console.error(
        `[DB] Migration v${migration.version} FAILED:`,
        error instanceof Error ? error.message : String(error),
      );
      throw new Error(
        `Migration v${migration.version} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Safety net: ensure all core tables exist regardless of migration state.
  // This is idempotent (IF NOT EXISTS) and protects against partial migration
  // failures leaving the database in a broken state.
  try {
    await ensureCoreSchema(db);
    console.log("[DB] Core schema verified.");
  } catch (error) {
    console.error(
      "[DB] ensureCoreSchema failed:",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
