'use strict';
require('dotenv').config();
const filename=process.argv[2];
if(!filename)throw Error('Provide a new private database path');
require('../googleDrive').importReportDatabase(filename).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
