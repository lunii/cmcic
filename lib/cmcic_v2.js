var crypto = require('crypto');
var _ = require('underscore');

// https://www.monetico-paiement.fr/fr/info/documentations/Monetico_Paiement_documentation_migration_3DSv2_1.0.pdf

// var banks = {
//   'CIC': 'https://ssl.paiement.cic-banques.fr',
//   'CM': 'https://paiement.creditmutuel.fr',
//   'OBC': 'https://ssl.paiement.banque-obc.fr'
// };

// FIXME: replace urls
    // test
    // https://p.monetico-services.com/test/paiement.cgi
    // capture : https://payment-api.e-i.com/test/capture_paiement.cgi
    // recredit : https://payment-api.e-i.com/test/recredit_paiement.cgi

    // prod
    // https://p.monetico-services.com/paiement.cgi
    // capture : https://payment-api.e-i.com/capture_paiement.cgi
    // recredit : https://payment-api.e-i.com/recredit_paiement.cgi

// TODO: Mise à plat du champs options
// TODO: Ajout de deux nouveaux paramètres d’appeletvérification stricte des paramètres en entrée
// TODO: Utilisation du nouveau calcul de sceau MAC
// TODO: Suppression du paramètre url_retour

var CMCIC = function () {};

CMCIC.calculateMAC = function (data, key) {

  var key = CMCIC.getHashKey(key);
  key = new Buffer(key, 'ascii');

  const processedData = Object.keys(data).sort().reduce((acc, currentKey) => {
    acc += '*' + currentKey + "=" + data[currentKey];
    return acc;
  }, "");

  return crypto.createHmac('sha1', key).update(processedData).digest('hex');
};

CMCIC.getHashKey = function (key) {
  var hexStrkey = key.slice(0, 38),
  hexFinal = '' + key.slice(38) + '00',
  cca0 = hexFinal.charCodeAt(0);

  if (cca0  > 70 && cca0 < 97){
    hexStrkey += String.fromCharCode(cca0-23) + hexFinal.charAt(1);
  } else {
    if (hexFinal.charAt(1) == 'M'){
      hexStrkey += hexFinal.charAt(0) + '0';
    } else {
      hexStrkey += hexFinal.slice(0, 2);
    }
  }

  var r = '';
  for (var i = 0; i < hexStrkey.length / 2; i++) {
    var hex = hexStrkey[i*2] + hexStrkey[i*2 + 1];
    var hexPack = parseInt(hex, 16);
    r +=  String.fromCharCode(hexPack);
  }
  return r;
};

/**
* TPE method
*/

CMCIC.tpe = function (config) {
  this._tpe = {};
  this.RETURN_OK = 'version=2\ncdr=0\n';
  this.RETURN_NOTOK = 'version=2\ncdr=1\n';

  this.init(config);
};

CMCIC.tpe.prototype.init = function (config) {
  this._tpe = {
    TPE: '',
    version: '3.0',
    societe: '',
    keyHMAC: '',
    lgue: 'FR',
    libelleMonetique: '',
    libelleMonetiqueLocalite: '',
    currency: 'EUR',
    billing_server: 'https://p.monetico-services.com',
    url_retour_ok: "",
    url_retour_err: "",
    test: false
  };

  this._postOptions = {
    host:'',
    path: '',
    method: 'POST'
  };
  if (config) {
    _.extend(this._tpe, config);
  }
  this._setServer();
};

CMCIC.tpe.prototype.configure = function (cmcic) {
  if (cmcic) {
    _.extend(this._tpe, cmcic);
  }
  this._setServer();
};

CMCIC.tpe.prototype._setServer = function () {

  var server = "https://p.monetico-services.com";

  this._postOptions.host = server.replace('https://', '');

  if (this._tpe.test) {
    server += '/test';
    this._postOptions.path = '/test/paiement.cgi';
  }

  if (!this._tpe.test) {
    this._postOptions.path = '/paiement.cgi';
  }

  server += '/paiement.cgi';

  this._tpe.billing_server = server;

};

CMCIC.tpe.prototype.checkTransactionReturn = function (transactionData) {
  if (!transactionData.motifrefus) {
    transactionData.motifrefus = '';
  }

  var data =  transactionData.TPE +
    '*' + transactionData.date +
    '*' + transactionData.montant +
    '*' + transactionData.reference +
    '*' + transactionData['texte-libre'] +
    '*' + this._tpe.version +
    '*' + transactionData['code-retour'] +
    '*' + transactionData.cvx +
    '*' + transactionData.vld +
    '*' + transactionData.brand +
    '*' + (transactionData.numauto || '') +
    '*' + transactionData.motifrefus +
    '*' + transactionData.originecb +
    '*' + transactionData.bincb +
    '*' + transactionData.hpancb +
    '*' + transactionData.ipclient +
    '*' + transactionData.originetr +
    '*' + transactionData.status3ds +
    '*' + transactionData.veres +
    '*' + transactionData.pares +
    '*';

  // var data = {
  //   ...transactionData
  // };

  // TODO: data should be an object

  var mac = CMCIC.calculateMAC(data, this._tpe.CMCIC_CLE);

  var isSealValidated = mac.toUpperCase() === transactionData.MAC.toUpperCase();

  if (transactionData['code-retour'] === 'paiement' ||  transactionData['code-retour'] === 'payetest') {

    return {
      'status': true,
      'isSealValidated': isSealValidated,
      'date': transactionData.date,
      'TPE' : transactionData.TPE,
      'montant': transactionData.montant,
      'reference': transactionData.reference,
      'texte-libre': JSON.parse(new Buffer(transactionData['texte-libre'], 'base64').toString('ascii')),
      'code-retour': transactionData['code-retour'],
      'cvx': transactionData.cvx,
      'vld': transactionData.vld,
      'brand': transactionData.brand,
      'status3ds': transactionData.status3ds,
      'numauto': transactionData.numauto,
      'originecb': transactionData.originecb,
      'bincb': transactionData.bincb,
      'hpancb': transactionData.hpancb,
      'ipclient': transactionData.ipclient,
      'oririnetr': transactionData.originetr,
      'veres': transactionData.veres,
      'pares': transactionData.pares,
      'montantech': transactionData.montantech,
      'cbenregistree': transactionData.cbenregistree,
      'cbmasquee': transactionData.cbmasquee
    };

  } else {

    return {
      'status': false,
      'isSealValidated': isSealValidated,
      'date': transactionData.date,
      'TPE' : transactionData.TPE,
      'montant': transactionData.montant,
      'reference': transactionData.reference,
      'texte-libre': JSON.parse(new Buffer(transactionData['texte-libre'], 'base64').toString('ascii')),
      'code-retour': transactionData['code-retour'],
      'cvx': transactionData.cvx,
      'vld': transactionData.vld,
      'brand': transactionData.brand,
      'status3ds': transactionData.status3ds,
      'numauto': transactionData.numauto,
      'motifrefus': transactionData.motifrefus,
      'originecb': transactionData.originecb,
      'bincb': transactionData.bincb,
      'hpancb': transactionData.hpancb,
      'ipclient': transactionData.ipclient,
      'oririnetr': transactionData.originetr,
      'veres': transactionData.veres,
      'pares': transactionData.pares,
      'montantech': transactionData.montantech,
      'filtragecause': transactionData.filtragecause,
      'filtragevaleur': transactionData.filtragevaleur,
      'cbenregistree': transactionData.cbenregistree,
      'cbmasquee': transactionData.cbmasquee
    };

  }
};

CMCIC.tpe.prototype.set = function (key, value) {

  var set = {};
  set[key] = value;
  this.configure(set);

  return this._tpe[key];

};

CMCIC.tpe.prototype.get = function (key) {

  return this._tpe[key];

};

/**
* Transaction method
*/

CMCIC.transaction = function (tpe, transactionData) {

  this._tpe = tpe;
  this._data = {};
  this.init(transactionData);

};

CMCIC.transaction.prototype.init = function (transactionData) {

  this._data = {
    date: '',
    amount: '',
    reference: '',
    texteLibre: {},
    contexte_commande: '',
    email: '',

    // new fields
    aliascb: '',
    forcesaisiecb: '',
    '3dsdebrayable': '',
    libelleMonetique: '',
    desactivemoyenpaiement: '',
    ThreeDSecureChallenge: 'no_challenge_requested'
  };

  _.extend(this._data, transactionData);

};

CMCIC.transaction.prototype.dataToSend = function (data) {

  if (!data) {
    data = this._data;
  }

  return {
    "version": this._tpe._tpe.version,
    "TPE": this._tpe._tpe.TPE,
    "url_retour_ok": this._tpe._tpe.url_retour_ok,
    "url_retour_err": this._tpe._tpe.url_retour_err,
    "date": data.date,
    "montant": data.amount + this._tpe._tpe.currency,
    "reference": data.reference,
    "texte-libre": data.texteLibre,
    "lgue": this._tpe._tpe.lgue,
    "societe": this._tpe._tpe.societe,
    "mail": data.email,
    "contexte_commande": data.contexte_commande,
  };
};

CMCIC.transaction.prototype._getDate = function () {

  var d = new Date();
  var day = (d.getDate() < 10) ? '0' + d.getDate() : d.getDate();
  var month = ( (d.getMonth() + 1) < 10) ? '0'+(d.getMonth()+1) : d.getMonth()+1;
  var year = d.getFullYear();
  var hour = (d.getHours() < 10) ? '0' + d.getHours() : d.getHours();
  var minute = (d.getMinutes() < 10) ? '0' + d.getMinutes() : d.getMinutes();
  var second = (d.getSeconds() < 10) ? '0' + d.getSeconds() : d.getSeconds();

  if (this._data.date === '') {
    this._data.date = day + '/' + month + '/' + year + ':' + hour + ':' + minute + ':' + second;
  }

};

CMCIC.transaction.prototype.form = function (id, autosubmit) {
  this._getDate();

  this._data.texteLibre = new Buffer(JSON.stringify(this._data.texteLibre)).toString('base64');

  const dataToSend = this.dataToSend();

  const inputs = Object.keys(dataToSend).reduce( (acc, dataKey) => {
    acc += `<input type="hidden" name="${dataKey}" value="${dataToSend[dataKey]}">`
  }, '');

  var mac = CMCIC.calculateMAC(dataToSend, this._tpe._tpe.CMCIC_CLE);

  var result = '<form method="post" id="'  +  id  +  '" action="'  +  this._tpe._tpe.billing_server  +  '">'  +
    '<input type="hidden" name="MAC" value="' + mac + '">' +
    inputs +
    '<div class="submit">' +
    '<input type="submit" name="bouton" value="">' +
    '</div></form>';

  if (autosubmit === true) {
    result += '<script type="text/javascript">(function(){document.getElementById(\''+id+'\').submit();})();</script>';
  }

  return result;
};

module.exports = CMCIC;
