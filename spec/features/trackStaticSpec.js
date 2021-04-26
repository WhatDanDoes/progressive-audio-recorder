const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);

const fs = require('fs');
const app = require('../../app');
const fixtures = require('pow-mongoose-fixtures');
const models = require('../../models');
const request = require('supertest');
const path = require('path');

const stubAuth0Sessions = require('../support/stubAuth0Sessions');

/**
 * `mock-fs` stubs the entire file system. So if a module hasn't
 * already been `require`d the tests will fail because the
 * module doesn't exist in the mocked file system. `ejs` and
 * `iconv-lite/encodings` are required here to solve that
 * problem.
 */
const mock = require('mock-fs');
const mockAndUnmock = require('../support/mockAndUnmock')(mock);

describe('trackStaticSpec', () => {
  let browser, agent, lanny, troy;

  beforeEach(done => {
    browser = new Browser({ waitDuration: '30s', loadCss: false });
    //browser.debug();
    fixtures.load(__dirname + '/../fixtures/agents.js', models.mongoose, err => {
      models.Agent.findOne({ email: 'daniel@example.com' }).then(results => {
        agent = results;
        models.Agent.findOne({ email: 'lanny@example.com' }).then(results => {
          lanny = results;
          models.Agent.findOne({ email: 'troy@example.com' }).then(results => {
            troy = results;

            browser.visit('/', err => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          }).catch(err => {
            done.fail(err);
          });
        }).catch(err => {
          done.fail(err);
        });
      }).catch(err => {
        done.fail(err);
      });
    });
  });

  afterEach(done => {
    mock.restore();
    models.mongoose.connection.db.dropDatabase().then((err, result) => {
      done();
    }).catch(err => {
      done.fail(err);
    });
  });

  describe('authenticated', () => {
    beforeEach(done => {
      stubAuth0Sessions(agent.email, DOMAIN, err => {
        if (err) done.fail(err);

        mockAndUnmock({
          [`uploads/${agent.getAgentDirectory()}`]: {
            'track1.ogg': fs.readFileSync('spec/files/troll.ogg'),
          },
          [`uploads/${lanny.getAgentDirectory()}`]: {
            'lanny1.ogg': fs.readFileSync('spec/files/troll.ogg'),
          },
          [`uploads/${troy.getAgentDirectory()}`]: {
            'troy1.ogg': fs.readFileSync('spec/files/troll.ogg'),
            'troy2.ogg': fs.readFileSync('spec/files/troll.ogg'),
          },
          'public/tracks/uploads': {}
        });

        const tracks = [
          { path: `uploads/${agent.getAgentDirectory()}/track1.ogg`, recordist: agent._id },
          { path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`, recordist: lanny._id },
          { path: `uploads/${troy.getAgentDirectory()}/troy1.ogg`, recordist: troy._id, published: new Date() },
          { path: `uploads/${troy.getAgentDirectory()}/troy2.ogg`, recordist: troy._id },
        ];
        models.Track.create(tracks).then(results => {

          browser.clickLink('Login', err => {
            if (err) done.fail(err);
            browser.assert.success();
            done();
          });
        }).catch(err => {
          done.fail(err);
        });
      });
    });

    describe('authorized', () => {
      it('allows an agent to view his own static track file', done => {
        request(app)
          .get(`/uploads/${agent.getAgentDirectory()}/track1.ogg`)
          .set('Cookie', browser.cookies)
          .expect(200)
          .end((err, res) => {
            if (err) done.fail(err);
            done();
          });
      });

      it('allows an agent to view a static track file he is allowed read', done => {
        expect(agent.canRead.length).toEqual(1);
        expect(agent.canRead[0]).toEqual(lanny._id);
        request(app)
          .get(`/uploads/${lanny.getAgentDirectory()}/lanny1.ogg`)
          .set('Cookie', browser.cookies)
          .expect(200)
          .end((err, res) => {
            if (err) done.fail(err);
            done();
          });
      });

      it('allows an agent to view a static track file that has been published', done => {
        models.Track.find({ published: { '$ne': null } }).then(published => {
          expect(published.length).toEqual(1);
          request(app)
            .get(`/${published[0].path}`)
            .set('Cookie', browser.cookies)
            .expect(200)
            .end((err, res) => {
              if (err) done.fail(err);
              done();
            });
        }).catch(err => {
          done.fail();
        });
      });
    });

    describe('unauthorized', () => {
      it('does not allow an agent to view a static track for which he has not been granted access', done => {
        expect(agent.canRead.length).toEqual(1);
        expect(agent.canRead[0]).not.toEqual(troy._id);

        request(app)
          .get(`/uploads/${troy.getAgentDirectory()}/troy2.ogg`)
          .set('Cookie', browser.cookies)
          .expect(403)
          .end((err, res) => {
            if (err) done.fail(err);
            done();
          });
      });

      it('does not allow an agent to view a static track file that has been not been published', done => {
        models.Track.find({ published: null, recordist: troy._id}).then(unpublished => {
          expect(unpublished.length).toEqual(1);
          request(app)
            .get(`/${unpublished[0].path}`)
            .set('Cookie', browser.cookies)
            .expect(403)
            .end((err, res) => {
              if (err) done.fail(err);
              done();
            });
        }).catch(err => {
          done.fail(err);
        });
      });
    });
  });

  describe('unauthenticated', () => {
    beforeEach(done => {
      mockAndUnmock({
        [`uploads/${agent.getAgentDirectory()}`]: {
          'track1.ogg': fs.readFileSync('spec/files/troll.ogg'),
        },
        [`uploads/${lanny.getAgentDirectory()}`]: {
          'lanny1.ogg': fs.readFileSync('spec/files/troll.ogg'),
        },
        [`uploads/${troy.getAgentDirectory()}`]: {
          'troy1.ogg': fs.readFileSync('spec/files/troll.ogg'),
          'troy2.ogg': fs.readFileSync('spec/files/troll.ogg'),
        },
        'public/tracks/uploads': {}
      });

      const tracks = [
        { path: `uploads/${agent.getAgentDirectory()}/track1.ogg`, recordist: agent._id },
        { path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`, recordist: lanny._id },
        { path: `uploads/${troy.getAgentDirectory()}/troy1.ogg`, recordist: troy._id, published: new Date() },
        { path: `uploads/${troy.getAgentDirectory()}/troy2.ogg`, recordist: troy._id },
      ];
      models.Track.create(tracks).then(results => {
        done();
      }).catch(err => {
        done.fail(err);
      });
    });

    it('returns a 404', done => {
      request(app)
        .get(`/uploads/${agent.getAgentDirectory()}/track1.ogg`)
        .set('Cookie', browser.cookies)
        .expect(404)
        .end((err, res) => {
          if (err) done.fail(err);
          done();
        });
    });

    it('finds a static track file that has been published', done => {
      models.Track.find({ published: { '$ne': null } }).then(published => {
        expect(published.length).toEqual(1);
        request(app)
          .get(`/${published[0].path}`)
          .set('Cookie', browser.cookies)
          .expect(200)
          .end((err, res) => {
            if (err) done.fail(err);
            done();
          });
      }).catch(err => {
        done.fail();
      });
    });
  });
});
