import { chai, assert } from 'chai'
import { Meteor } from 'meteor/meteor'
import { Problems } from "./problemCollection.js"
import { callWithPromise } from '/imports/api/utilities'
import './problemMethods.js'

import { Notifications } from '/imports/api/notifications/both/notificationsCollection'

Meteor.userId = () => 'test-user' // override the meteor userId, so we can test methods that require a user
Meteor.users.findOne = () => ({ profile: { name: 'Test User'} }) // stub user data as well
Meteor.user = () => ({ profile: { name: 'Test User'} })
/*Meteor.users.find = () => ({
  fetch: () => {
    return [{
      _id: 'test1',
      profile: {
        name: 'Test User'
      }
    }, {
      _id: 'test2',
      profile: {
        name: 'Test User 2'
      }
    }]
  }
})*/

describe('problem methods', () => {
    beforeEach(() => {
        Problems.insert({
            summary: "Derp",
            description: "Lorem ipsum, herp derp durr.",
            solution: "Lorem ipsum, herp derp durr.",
            createdAt: new Date().getTime(),
            createdBy: ''
        })
    })

    it('can mark problem as resolved if current user is claimer', () => {
        let problem = Problems.findOne({})
        assert.ok(problem)

        Problems.update({ _id : problem._id }, {
            $set : { claimedBy : Meteor.userId() }
        })

        return callWithPromise('markAsResolved', {
            problemId: problem._id,
            claimerId: Meteor.userId(),
            resolutionSummary: 'Some random resolution summary...'
        }).then(problemId => {
            let problem = Problems.findOne({ _id : problemId})
            assert.equal(problem.status, 'ready for review')
        })

    })

    it('can mark problem as unsolved if current user is claimer', () => {
        let problem = Problems.findOne({})
        assert.ok(problem)

        Problems.update({ _id : problem._id }, {
            $set : { claimedBy : Meteor.userId() }
        })

        return callWithPromise('markAsUnSolved', {
            problemId: problem._id,
            claimerId: Meteor.userId()
        }).then(problemId => {
            let problem = Problems.findOne({ _id : problemId})
            assert.equal(problem.status, 'in progress')
        })

    })

    it('cannot mark problem as unsolved if current user isnt claimer', () => {
        let problem = Problems.findOne({})
        assert.ok(problem)

        Problems.update({ _id : problem._id }, {
            $set : { claimedBy : 'fake-claimer' }
        })

        return callWithPromise('markAsUnSolved', {
            problemId: problem._id,
            claimerId: 'fake-claimer'
        }).then(data => {
            assert.isNull(data)
        }).catch(err => {
            assert.include(err.message, 'You are not allowed to unsolve this problem')
        })

    })
	it('cannot mark problem as resolved if current user isnt claimer', () => {
        let problem = Problems.findOne({})
        assert.ok(problem)

        Problems.update({ _id : problem._id }, {
            $set : { claimedBy : 'fake-claimer' }
        })

        return callWithPromise('markAsResolved', {
            problemId: problem._id,
            claimerId: 'fake-claimer',
            resolutionSummary: 'Some random resolution summary...'
        }).then(data => {
            assert.isNull(data)
        }).catch(err => {
            assert.include(err.message, 'You are not allowed to resolve this problem')
        })

    })

    it('can kick out claimer if is problem owner', () => {
        let problem = Problems.findOne({})
        assert.ok(problem)

        Problems.update({ _id : problem._id }, {
            $set : { 
                createdBy : Meteor.userId(),
                claimedBy : 'another-claimer' 
            }
        })

        return callWithPromise('removeClaimer', {
            problemId: problem._id
        }).then(problemId => {
            let problem = Problems.findOne({_id : problemId })
            assert.isUndefined(problem.claimedBy)
        })
    })

    it('cannot kick out claimer if isn\'t problem owner', () => {
        let problem = Problems.findOne({})
        assert.ok(problem)

        Problems.update({ _id : problem._id }, {
            $set : { 
                createdBy : 'another-owner',
                claimedBy : 'another-claimer' 
            }
        })

        return callWithPromise('removeClaimer', {
            problemId: problem._id
        }).then(problemId => {
            assert.isNull(problemId)
        }).catch(err => {
            assert.include(err.message, 'You are not allowed to remove claimer')
        })
    })

    it('cannot close the problem if current user isnt creator', () => {
          let problem = Problems.findOne({})
          assert.ok(problem)

          return callWithPromise('updateStatus', {
              problemId: problem._id,
              status: 'closed'
          }).then(data => {
              assert.isNull(data)
          }).catch(err => {
              assert.include(err.message, 'You are not allowed to open or close this problem')
          })

      })

    it('can close the problem if current user is creator', () => {
          let problem = Problems.findOne({})
          assert.ok(problem)

          Problems.update({ _id : problem._id }, {
              $set : { createdBy : Meteor.userId() }
          })

          return callWithPromise('updateStatus', {
              problemId: problem._id,
              status: 'closed'
          }).then(problemId => {
            let problem = Problems.findOne({ _id : problemId})
            assert.equal(problem.status, 'closed')
          })

    })

    it('can reopen a problem and take ownership', () => {
        let problem = Problems.findOne({
            status: 'closed'
        })
        assert.ok(problem)

        Problems.update({
            _id: problem._id
        }, {
            $set: {
                createdBy: 'someone-else'
            }
        })

        return callWithPromise('reopenProblem', {
            problemId: problem._id,
            reason: 'I don\'t know.'
        }).then(problemId => {
            let problem = Problems.findOne({
                _id: problemId
            })

            assert.ok(problem)

            assert.equal(problem.status, 'open')
            assert.equal(problem.resolved, false)
            assert.equal(problem.hasAcceptedSolution, false)
            assert.equal(problem.resolvedBy, '')
            assert.equal(problem.resolveSteps, '')
            assert.equal(problem.claimedBy, '')
            assert.equal(problem.claimed, false)
            assert.equal(problem.claimedFullname, '')
            assert.equal(problem.claimedDateTime, '')
            assert.equal(problem.createdBy, Meteor.userId())
            assert.ok((problem.previousSolutions || []).length > 0)
        })
    })

    it('can claim the problem if available', () => {
        let problem = Problems.findOne({})
        assert.ok(problem)

        Problems.update({ _id : problem._id }, {
            $set : { claimedBy : '', claimed: false }
        })

        return callWithPromise('claimProblem', {
            _id: problem._id,
            estimate: 60
        }).then(problemId => {
          let problem = Problems.findOne({ _id : problemId})
          assert.equal(problem.claimedBy, Meteor.userId())
        })
      })

    it('cannot claim the problem if already claimed', () => {
        let problem = Problems.findOne({})
        assert.ok(problem)

        Problems.update({ _id : problem._id }, {
            $set : { claimedBy : 'admin', claimed: true }
        })

        return callWithPromise('claimProblem', {
            _id: problem._id,
            estimate: 60
        }).then(data => {
            assert.isNull(data)
        }).catch(err => {
            assert.include(err.message, 'You cannot claim a problem that is already claimed')
        })
    })

      it('can unclaim the problem if claimed by user', () => {
          let problem = Problems.findOne({})
          assert.ok(problem)

          Problems.update({ _id : problem._id }, {
              $set : { claimedBy : Meteor.userId(), claimed: true }
          })

          return callWithPromise('unclaimProblem', {
              _id: problem._id,
          }).then(problemId => {
            let problem = Problems.findOne({ _id : problemId})
            assert.equal(problem.claimedBy, undefined)
          })
        })

      it('cannot unclaim the problem if not claimed by user', () => {
          let problem = Problems.findOne({})
          assert.ok(problem)

          Problems.update({ _id : problem._id }, {
              $set : { claimedBy : 'admin', claimed: true }
          })

          return callWithPromise('unclaimProblem', {
              _id: problem._id
          }).then(data => {
              assert.isNull(data)
          }).catch(err => {
              assert.include(err.message, 'You cannot unclaim a problem that is not claimed by you')
          })
        })

      it('can edit the problem if user is creator', () => {
          let problem = Problems.findOne({})
          assert.ok(problem)

          Problems.update({ _id : problem._id }, {
              $set : { createdBy : Meteor.userId() }
          })

          return callWithPromise('editProblem', {
              id: problem._id,
              summary: 'This is a problem',
              description: 'This is a problem',
              solution: 'This is a problem'
          }).then(problemId => {
            let problem = Problems.findOne({ _id : problemId})
            assert.equal(problem.summary, 'This is a problem');
          })
        })

      it('cannot edit the problem if user is not creator', () => {
          let problem = Problems.findOne({})
          assert.ok(problem)

          Problems.update({ _id : problem._id }, {
              $set : { createdBy : '' }
          })

          return callWithPromise('editProblem', {
              id: problem._id,
              summary: 'This is a problem',
              description: 'This is a problem',
              solution: 'This is a problem'
          }).then(data => {
              assert.isNull(data)
          }).catch(err => {
              assert.include(err.message, 'You cannot edit a problem you did not create')
          })
        })

      it('can delete the problem if user is creator', () => {
          let problem = Problems.findOne({})
          assert.ok(problem)

          Problems.update({ _id : problem._id }, {
              $set : { createdBy : Meteor.userId() }
          })

          return callWithPromise('deleteProblem', {
              id: problem._id,
          }).then(problemId => {
            let problem = Problems.findOne({ _id : problemId})
            assert.equal(problem, undefined);
          })
        })

      it('cannot delete the problem if user is not creator', () => {
          let problem = Problems.findOne({})
          assert.ok(problem)

          Problems.update({ _id : problem._id }, {
              $set : { createdBy : '' }
          })

          return callWithPromise('deleteProblem', {
              id: problem._id
          }).then(data => {
              assert.isNull(data)
          }).catch(err => {
              assert.include(err.message, 'You cannot delete the problems you did not create')
          })
        })
    it ('users can subscribe to a problem', () => {
      let problem = Problems.findOne({})
      assert.ok(problem)

      callWithPromise('watchProblem', {
        _id: problem._id
      }).then(data => {
        let p = Problems.findOne({
          _id: problem._id
        })

        assert.notEqual(p.subscribers.indexOf(Meteor.userId()), -1)
      })
    })

    it ('users can +1 a problem', () => {
      let problem = Problems.findOne({})
      assert.ok(problem)

      return callWithPromise('problemApproval', {
        _id: problem._id
      }).then(data => {
        let p = Problems.findOne({
          _id: problem._id
        })

        assert.notEqual(p.approvals.indexOf(Meteor.userId()), -1)
      })
    })

    it ('users can -1 a problem', () => {
      let problem = Problems.findOne({})
      assert.ok(problem)

      return callWithPromise('problemApproval', {
        _id: problem._id
      }).then(data => {
        let p = Problems.findOne({
          _id: problem._id
        })

        assert.equal(p.approvals.indexOf(Meteor.userId()), -1)
      })
    })

    it ('users can unsubscribe from a problem', () => {
      let problem = Problems.findOne({})
      assert.ok(problem)

      callWithPromise('unwatchProblem', {
        _id: problem._id
      }).then(data => {
        let p = Problems.findOne({
          _id: problem._id
        })

        assert.equal(p.subscribers.indexOf(Meteor.userId()), -1)
      })
    })

    it ('users are notified if it\'s a fyi problem', () => {
      return callWithPromise('addProblem', {
        summary: 'test summary',
        fyiProblem: true,
        dependencies: [],
        invDependencies: []
      }).then(data => {
        assert.ok(data)

        let problem = Problems.findOne({
          _id: data
        })

        assert.ok(problem)

        let notifications = Notifications.find({
          href: `/${problem._id}`
        }).fetch()

        assert.ok(notifications.length === Meteor.users.find({}).fetch().length)
      })
    })

    after(function() {
        Problems.remove({})
    })
})
